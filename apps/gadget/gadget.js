/* Perseus Wikipedia user script / ResourceLoader gadget.
 * No build step or third-party runtime is required. Keep this file auditable.
 */
(() => {
  const DEFAULT_API_BASE = "https://perseus.toolforge.org";
  const SESSION_KEY = "perseus-toolforge-session-v1";
  const POLL_MS = 2500;
  const ACTIVE = new Set(["queued", "running", "retrying", "cancelling"]);
  const TARGETS = { fa: "فارسی", tg: "تاجیکی" };

  function sourceWikiFromHost(hostname) {
    const match = /^([a-z0-9-]+)\.(?:m\.)?wikipedia\.org$/i.exec(hostname);
    if (!match || ["fa", "tg", "www"].includes(match[1].toLowerCase())) {
      return null;
    }
    return match[1].toLowerCase() + "wiki";
  }

  function normalizeTitle(title) {
    return String(title || "")
      .replace(/_/g, " ")
      .trim()
      .toLowerCase();
  }

  function sameSource(job, wiki, title, pageId) {
    if (!job || !job.source || job.source.wiki !== wiki) return false;
    if (pageId > 0 && job.source.pageId > 0) {
      return job.source.pageId === pageId;
    }
    return normalizeTitle(job.source.title) === normalizeTitle(title);
  }

  function visitSections(sections, callback) {
    (sections || []).forEach((section) => {
      callback(section);
      visitSections(section.children, callback);
    });
  }

  function defaultSelection(sections) {
    const selection = { lead: true, sections: {} };
    visitSections(sections, (section) => {
      selection.sections[section.id] = { selected: true, ownText: true };
    });
    return selection;
  }

  function setBranch(selection, section, selected) {
    visitSections([section], (node) => {
      selection.sections[node.id] = { selected: selected, ownText: selected };
    });
    return selection;
  }

  function setOwnText(selection, section, selected) {
    const current = selection.sections[section.id] || {
      selected: false,
      ownText: false,
    };
    selection.sections[section.id] = {
      selected: selected ? true : current.selected,
      ownText: selected,
    };
    return selection;
  }

  function branchState(selection, section) {
    const current = selection.sections[section.id] || {
      selected: false,
      ownText: false,
    };
    const own = current.selected && (!section.hasOwnText || current.ownText);
    const childStates = (section.children || []).map((child) =>
      branchState(selection, child),
    );
    const all = own && childStates.every((state) => state.all);
    const some = own || childStates.some((state) => state.some);
    return { all: all, some: some };
  }

  function hasSelectedContent(selection, sections) {
    if (selection.lead) return true;
    let found = false;
    visitSections(sections, (section) => {
      const item = selection.sections[section.id];
      if (section.hasOwnText && item && item.selected && item.ownText) {
        found = true;
      }
    });
    return found;
  }

  function apiBase(raw) {
    const url = new URL(raw || DEFAULT_API_BASE);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("نشانی backend باید یک origin امن HTTPS باشد.");
    }
    return url.origin;
  }

  function safeEquivalentUrl(raw, target) {
    try {
      const url = new URL(raw);
      if (
        url.protocol === "https:" &&
        url.hostname === target + ".wikipedia.org"
      )
        return url.href;
    } catch (_) {}
    return null;
  }

  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  }

  function button(label, action, className, key, disabled) {
    const node = make("button", className || "perseus-button", label);
    node.type = "button";
    if (key) node.dataset.focus = key;
    node.disabled = Boolean(disabled);
    node.addEventListener("click", action);
    return node;
  }

  function errorText(error) {
    const known = {
      SOURCE_CHANGED:
        "نسخهٔ مقاله تغییر کرده است. صفحه را تازه کنید و بخش‌ها را دوباره انتخاب کنید.",
      SOURCE_NOT_ELIGIBLE: "این صفحه برای ترجمه پشتیبانی نمی‌شود.",
      SOURCE_TOO_LARGE: "حجم این مقاله از محدودیت فعلی بیشتر است.",
      SOURCE_NOT_FOUND: "مقالهٔ مبدأ پیدا نشد.",
      SELECTION_MISMATCH:
        "ساختار مقاله تغییر کرده است. بخش‌ها را دوباره بارگذاری کنید.",
      EMPTY_SELECTION: "حداقل یک بخش یا متن ابتدایی را انتخاب کنید.",
      ACTIVE_JOB_EXISTS: "یک ترجمهٔ دیگر برای این حساب در حال انجام است.",
      RESULT_EXISTS:
        "برای این مقاله نتیجه‌ای موجود است. برای جایگزینی آن دوباره تلاش کنید.",
      DAILY_LIMIT: "سقف درخواست روزانهٔ این حساب پر شده است.",
      RATE_LIMITED: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      OUTPUT_NOT_READY: "خروجی هنوز آماده نیست یا منقضی شده است.",
      TRANSLATION_INVALID:
        "ساختار متن ترجمه‌شده معتبر نبود؛ خروجی تحویل داده نشد.",
      OUTPUT_PROTOCOL_LEAK:
        "بازسازی ساختار مقاله ناموفق بود؛ خروجی تحویل داده نشد.",
      JOB_STALE: "اطلاعات بخش‌ها با نسخهٔ فعلی مقاله هماهنگ نیست.",
      AUTH_REQUIRED: "برای ادامه دوباره وارد شوید.",
      INVALID_SESSION: "نشست ورود منقضی شده است. دوباره وارد شوید.",
      UNAUTHORIZED: "نشست ورود منقضی شده است. دوباره وارد شوید.",
    };
    if (error && error.code && known[error.code]) return known[error.code];
    if (error && error.name === "AbortError") {
      return "پاسخ سرور دیر رسید. وضعیت ترجمه را دوباره بررسی کنید.";
    }
    if (error && error.name === "NotAllowedError") {
      return "مرورگر اجازهٔ کپی نداد. از دریافت فایل استفاده کنید.";
    }
    if (error instanceof TypeError) {
      return "اتصال به backend برقرار نشد. نشانی سرویس، CORS و CSP را بررسی کنید.";
    }
    return "درخواست انجام نشد. کمی بعد دوباره تلاش کنید.";
  }

  function stageText(stage) {
    const stages = {
      queued: "در صف",
      parsing: "آماده‌سازی مقاله",
      translating: "ترجمهٔ بخش‌ها",
      generating: "بازسازی ویکی‌متن",
      completed: "تکمیل‌شده",
      failed: "ناموفق",
      cancelling: "در حال لغو",
      cancelled: "لغوشده",
    };
    return stages[stage] || stage || "در حال پردازش";
  }

  function Api(base, getToken, onUnauthorized) {
    this.base = apiBase(base);
    this.getToken = getToken;
    this.onUnauthorized = onUnauthorized;
  }

  Api.prototype.request = async function (path, options) {
    options = options || {};
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 30000);
    const headers = {
      Accept: options.file ? "text/plain" : "application/json",
    };
    if (options.body !== undefined)
      headers["Content-Type"] = "application/json";
    if (options.auth !== false && this.getToken()) {
      headers.Authorization = "Bearer " + this.getToken();
    }
    try {
      const response = await fetch(this.base + path, {
        method: options.method || "GET",
        headers: headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: "omit",
        signal: controller.signal,
      });
      if (response.status === 401 && options.auth !== false) {
        this.onUnauthorized();
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const failure = new Error(
          (payload.error && payload.error.message) || "API error",
        );
        failure.code =
          (payload.error && payload.error.code) || "HTTP_" + response.status;
        failure.status = response.status;
        failure.requestId = response.headers.get("X-Request-Id");
        throw failure;
      }
      return options.file ? response.blob() : response.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  function Gadget(win) {
    this.win = win;
    this.mw = win.mw;
    this.wiki = sourceWikiFromHost(win.location.hostname);
    this.title = String(this.mw.config.get("wgPageName") || "").replace(
      /_/g,
      " ",
    );
    this.pageId = Number(this.mw.config.get("wgArticleId") || 0);
    this.namespace = Number(this.mw.config.get("wgNamespaceNumber"));
    this.token = null;
    try {
      this.token = win.sessionStorage.getItem(SESSION_KEY);
    } catch (_) {}
    this.api = new Api(
      win.PerseusGadgetConfig && win.PerseusGadgetConfig.apiBaseUrl,
      () => this.token,
      () => {
        this.clearSession();
        this.notice = "نشست ورود منقضی شده است. دوباره وارد شوید.";
        this.render();
      },
    );
    this.open = false;
    this.busy = false;
    this.loading = false;
    this.error = "";
    this.notice = "";
    this.user = null;
    this.source = null;
    this.inspectedTarget = null;
    this.sourceLoading = false;
    this.sourceRequest = 0;
    this.target = null;
    this.selection = null;
    this.currentJob = null;
    this.activeJob = null;
    this.recentJobs = [];
    this.events = [];
    this.eventsAfter = 0;
    this.outputText = null;
    this.outputBlob = null;
    this.outputLoading = false;
    this.detailsOpen = false;
    this.pollTimer = null;
    this.loginPopup = null;
    this.loginListener = null;
    this.loginTimer = null;
  }

  Gadget.prototype.mount = function () {
    this.root = make("div", "perseus-root");
    this.root.id = "perseus-gadget-root";
    this.launcher = button(
      "✦ Perseus",
      () => this.toggle(),
      "perseus-launcher",
      "launcher",
    );
    this.launcher.setAttribute("aria-controls", "perseus-gadget-panel");
    this.launcher.setAttribute("aria-expanded", "false");
    this.panel = make("aside", "perseus-panel");
    this.panel.id = "perseus-gadget-panel";
    this.panel.setAttribute("aria-label", "ترجمه با Perseus");
    this.panel.setAttribute("lang", "fa");
    this.panel.setAttribute("dir", "rtl");
    this.panel.hidden = true;
    this.root.append(this.launcher, this.panel);
    document.body.appendChild(this.root);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.open) this.toggle(false);
    });
  };

  Gadget.prototype.toggle = function (value) {
    this.open = value === undefined ? !this.open : value;
    this.panel.hidden = !this.open;
    this.launcher.setAttribute("aria-expanded", String(this.open));
    if (this.open) {
      this.render();
      if (this.token) void this.refresh();
      this.panel.querySelector(".perseus-close")?.focus();
    } else {
      this.stopPoll();
      this.launcher.focus();
    }
  };

  Gadget.prototype.clearSession = function () {
    this.token = null;
    this.user = null;
    this.currentJob = null;
    this.activeJob = null;
    this.source = null;
    this.inspectedTarget = null;
    this.selection = null;
    this.target = null;
    this.events = [];
    this.outputText = null;
    this.outputBlob = null;
    this.outputLoading = false;
    this.sourceRequest += 1;
    this.stopPoll();
    try {
      this.win.sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
    this.render();
  };

  Gadget.prototype.stopPoll = function () {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  };

  Gadget.prototype.schedulePoll = function () {
    this.stopPoll();
    if (!this.open || !this.currentJob || !ACTIVE.has(this.currentJob.status))
      return;
    this.pollTimer = setTimeout(async () => {
      await this.refreshJob();
      this.schedulePoll();
    }, POLL_MS);
  };

  Gadget.prototype.requestError = function (error) {
    this.error = errorText(error);
    if (error && error.requestId)
      this.error += " شناسهٔ درخواست: " + error.requestId;
    this.render();
  };

  Gadget.prototype.refresh = async function () {
    if (!this.token || !this.open) return;
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const me = await this.api.request("/v1/me");
      this.user = me.user;
      this.activeJob = me.activeJob;
      if (me.activeJob) {
        this.setJob(me.activeJob);
      } else {
        const recent = await this.api.request("/v1/jobs");
        this.recentJobs = recent.jobs || [];
        const restored = this.recentJobs.find(
          (job) =>
            sameSource(job, this.wiki, this.title, this.pageId) &&
            !["expired", "superseded", "cancelled"].includes(job.status),
        );
        this.setJob(restored || null);
      }
      if (this.canInspect()) await this.inspectSource(this.target || "fa");
      if (this.currentJob) await this.refreshJob();
    } catch (error) {
      if (this.token) this.requestError(error);
    } finally {
      this.loading = false;
      this.render();
      this.schedulePoll();
    }
  };

  Gadget.prototype.canInspect = function () {
    return this.wiki && this.namespace === 0 && this.pageId > 0;
  };

  Gadget.prototype.inspectSource = async function (target) {
    const requestId = ++this.sourceRequest;
    this.sourceLoading = true;
    this.render();
    try {
      const query = new URLSearchParams({
        wiki: this.wiki,
        title: this.title,
        targetWiki: target,
      });
      const source = await this.api.request("/v1/source?" + query.toString());
      if (requestId !== this.sourceRequest) return;
      const oldRevision = this.source && this.source.page.revisionId;
      this.source = source;
      this.inspectedTarget = target;
      if (!this.selection || oldRevision !== source.page.revisionId) {
        this.selection = defaultSelection(source.sections);
        if (oldRevision && oldRevision !== source.page.revisionId) {
          this.notice =
            "نسخهٔ مقاله تغییر کرده است؛ انتخاب بخش‌ها به حالت اولیه برگشت.";
        }
      }
      this.render();
    } catch (error) {
      if (requestId === this.sourceRequest) {
        this.inspectedTarget = null;
        this.requestError(error);
      }
    } finally {
      if (requestId === this.sourceRequest) {
        this.sourceLoading = false;
        this.render();
      }
    }
  };

  Gadget.prototype.setJob = function (job) {
    if (this.currentJob && job && this.currentJob.id === job.id) {
      this.currentJob = job;
      return;
    }
    this.currentJob = job;
    this.events = [];
    this.eventsAfter = 0;
    this.outputText = null;
    this.outputBlob = null;
    this.outputLoading = false;
    this.detailsOpen = false;
    if (job && !ACTIVE.has(job.status)) this.activeJob = null;
  };

  Gadget.prototype.refreshJob = async function () {
    if (!this.currentJob || !this.token) return;
    const id = this.currentJob.id;
    try {
      const results = await Promise.all([
        this.api.request("/v1/jobs/" + encodeURIComponent(id)),
        this.api.request(
          "/v1/jobs/" +
            encodeURIComponent(id) +
            "/events?after=" +
            this.eventsAfter,
        ),
      ]);
      if (!this.currentJob || this.currentJob.id !== id) return;
      this.currentJob = results[0].job;
      this.activeJob = ACTIVE.has(this.currentJob.status)
        ? this.currentJob
        : null;
      this.events.push.apply(this.events, results[1].events || []);
      this.eventsAfter = results[1].nextAfter || this.eventsAfter;
      if (
        this.currentJob.status !== "completed" ||
        !this.currentJob.outputAvailable
      ) {
        this.outputText = null;
        this.outputBlob = null;
      }
      this.render();
      if (
        this.currentJob.status === "completed" &&
        this.currentJob.outputAvailable
      ) {
        await this.prepareOutput();
      }
    } catch (error) {
      if (this.token) this.requestError(error);
    }
  };

  Gadget.prototype.prepareOutput = async function () {
    if (!this.currentJob || this.outputText !== null || this.outputLoading)
      return;
    const id = this.currentJob.id;
    this.outputLoading = true;
    this.render();
    try {
      const blob = await this.api.request(
        "/v1/jobs/" + encodeURIComponent(id) + "/output/article.wiki",
        { file: true },
      );
      const wikitext = await blob.text();
      if (this.currentJob && this.currentJob.id === id && wikitext.trim()) {
        this.outputBlob = blob;
        this.outputText = wikitext;
      }
    } catch (error) {
      if (this.token) this.requestError(error);
    } finally {
      this.outputLoading = false;
      this.render();
    }
  };

  Gadget.prototype.startLogin = function () {
    if (this.loginPopup) return;
    this.error = "";
    const url =
      this.api.base +
      "/auth/login?origin=" +
      encodeURIComponent(this.win.location.origin);
    const popup = this.win.open(url, "perseus-auth", "width=520,height=640");
    if (!popup) {
      this.error =
        "پنجرهٔ ورود باز نشد. اجازهٔ popup را بدهید و دوباره تلاش کنید.";
      this.render();
      return;
    }
    this.loginPopup = popup;
    this.loginListener = (event) => {
      if (
        event.origin !== this.api.base ||
        event.source !== popup ||
        !event.data ||
        event.data.type !== "perseus-auth" ||
        typeof event.data.code !== "string"
      )
        return;
      void this.finishLogin(event.data.code);
    };
    this.win.addEventListener("message", this.loginListener);
    this.loginTimer = setTimeout(() => {
      this.cleanupLogin();
      this.notice =
        "اگر ورود خودکار انجام نشد، کد نمایش‌داده‌شده در پنجرهٔ ورود را اینجا وارد کنید.";
      this.render();
    }, 120000);
    this.render();
  };

  Gadget.prototype.cleanupLogin = function () {
    if (this.loginListener)
      this.win.removeEventListener("message", this.loginListener);
    if (this.loginTimer) clearTimeout(this.loginTimer);
    this.loginListener = null;
    this.loginTimer = null;
    this.loginPopup = null;
  };

  Gadget.prototype.finishLogin = async function (code) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const response = await this.api.request("/auth/token", {
        method: "POST",
        body: { code: code.trim() },
        auth: false,
      });
      this.token = response.token;
      try {
        this.win.sessionStorage.setItem(SESSION_KEY, this.token);
      } catch (_) {}
      if (this.loginPopup && !this.loginPopup.closed) this.loginPopup.close();
      this.cleanupLogin();
      this.notice = "ورود انجام شد.";
      await this.refresh();
    } catch (error) {
      this.requestError(error);
    } finally {
      this.busy = false;
      this.render();
    }
  };

  Gadget.prototype.logout = async function () {
    this.busy = true;
    this.render();
    try {
      await this.api.request("/auth/logout", { method: "POST" });
    } catch (_) {
      // Local session removal still wins if the server is unavailable.
    } finally {
      this.clearSession();
      this.busy = false;
      this.notice = "از Perseus خارج شدید.";
      this.render();
    }
  };

  Gadget.prototype.startJob = async function () {
    if (!this.canStart()) return;
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const query = new URLSearchParams({
        wiki: this.wiki,
        title: this.source.page.title,
        targetWiki: this.target,
      });
      const lookup = await this.api.request(
        "/v1/jobs/lookup?" + query.toString(),
      );
      if (lookup.kind === "active") {
        this.setJob(lookup.job);
        this.activeJob = lookup.job;
        this.notice = "ترجمهٔ فعال حساب شما نمایش داده شد.";
        await this.refreshJob();
        this.schedulePoll();
        return;
      }
      const replace = lookup.kind === "restorable";
      if (
        replace &&
        !this.win.confirm(
          "نتیجه یا ترجمهٔ قبلی این مقاله پس از شروع ترجمهٔ تازه دیگر قابل بازیابی نیست. ادامه می‌دهید؟",
        )
      )
        return;
      const result = await this.api.request("/v1/jobs", {
        method: "POST",
        body: {
          source: {
            wiki: this.wiki,
            title: this.source.page.title,
            revisionId: this.source.page.revisionId,
          },
          targetWiki: this.target,
          selection: this.selection,
          replaceExisting: replace,
        },
      });
      this.setJob(result.job);
      this.activeJob = result.job;
      this.notice = "ترجمه آغاز شد. بستن صفحه، کار سرور را متوقف نمی‌کند.";
      this.schedulePoll();
    } catch (error) {
      this.requestError(error);
    } finally {
      this.busy = false;
      this.render();
    }
  };

  Gadget.prototype.canStart = function () {
    return Boolean(
      this.token &&
        !this.busy &&
        !this.sourceLoading &&
        !this.activeJob &&
        this.source &&
        this.source.eligible &&
        this.target &&
        this.inspectedTarget === this.target &&
        this.selection &&
        hasSelectedContent(this.selection, this.source.sections),
    );
  };

  Gadget.prototype.jobAction = async function (action) {
    if (!this.currentJob || this.busy) return;
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const result = await this.api.request(
        "/v1/jobs/" + encodeURIComponent(this.currentJob.id) + "/" + action,
        { method: "POST" },
      );
      this.currentJob = result.job;
      if (ACTIVE.has(result.job.status)) this.activeJob = result.job;
      this.notice =
        action === "cancel" ? "درخواست لغو ثبت شد." : "تلاش دوباره آغاز شد.";
      this.schedulePoll();
    } catch (error) {
      this.requestError(error);
    } finally {
      this.busy = false;
      this.render();
    }
  };

  Gadget.prototype.copyOutput = async function () {
    if (!this.currentJob || this.busy || this.outputText === null) return;
    const wikitext = this.outputText;
    this.busy = true;
    this.render();
    try {
      if (
        this.win.navigator.clipboard &&
        this.win.navigator.clipboard.writeText
      ) {
        await this.win.navigator.clipboard.writeText(wikitext);
      } else {
        const field = make("textarea", "perseus-copy-fallback");
        field.value = wikitext;
        document.body.appendChild(field);
        let copied;
        try {
          field.select();
          copied = document.execCommand("copy");
        } finally {
          field.remove();
        }
        if (!copied) throw new Error("Clipboard unavailable");
      }
      this.notice =
        "ویکی‌متن کپی شد. پیش از استفاده، متن و منابع را بازبینی کنید.";
      this.error = "";
    } catch (error) {
      this.requestError(error);
    } finally {
      this.busy = false;
      this.render();
    }
  };

  Gadget.prototype.downloadOutput = function () {
    if (!this.currentJob || this.busy || this.outputBlob === null) return;
    try {
      const url = URL.createObjectURL(this.outputBlob);
      const link = make("a");
      link.href = url;
      link.download = "article.wiki";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60000);
      this.notice =
        "دریافت فایل آغاز شد. پیش از استفاده، متن و منابع را بازبینی کنید.";
      this.error = "";
    } catch (error) {
      this.requestError(error);
    }
    this.render();
  };

  Gadget.prototype.render = function () {
    if (!this.panel || !this.open) return;
    const active = document.activeElement;
    const focusKey =
      this.panel.contains(active) && active.dataset && active.dataset.focus;
    const oldLog = this.panel.querySelector(".perseus-log");
    const logScroll = oldLog && oldLog.scrollTop;
    const header = make("div", "perseus-header");
    const title = make("h2", "", "Perseus");
    const close = button(
      "بستن ×",
      () => this.toggle(false),
      "perseus-close",
      "close",
    );
    header.append(title, close);
    const body = make("div", "perseus-body");
    if (this.notice) body.append(make("p", "perseus-notice", this.notice));
    if (this.error) {
      const error = make("p", "perseus-error", this.error);
      error.setAttribute("role", "alert");
      body.append(error);
    }
    if (!this.token) {
      body.append(this.renderLogin());
    } else {
      const account = make("div", "perseus-account");
      account.append(
        make(
          "span",
          "",
          this.user ? "حساب: " + this.user.username : "حساب متصل",
        ),
        button(
          "خروج",
          () => void this.logout(),
          "perseus-link-button",
          "logout",
          this.busy,
        ),
      );
      body.append(account);
      if (this.loading)
        body.append(make("p", "perseus-muted", "در حال دریافت وضعیت…"));
      if (this.currentJob) body.append(this.renderJob());
      if (
        this.activeJob &&
        !sameSource(this.activeJob, this.wiki, this.title, this.pageId)
      ) {
        body.append(
          make(
            "p",
            "perseus-note",
            "یک ترجمهٔ دیگر فعال است؛ تا پایان یا لغو آن، شروع ترجمهٔ تازه ممکن نیست.",
          ),
        );
      }
      body.append(this.renderSource());
    }
    this.panel.replaceChildren(header, body);
    if (focusKey) {
      const candidate = Array.from(
        this.panel.querySelectorAll("[data-focus]"),
      ).find((node) => node.dataset.focus === focusKey);
      if (candidate) candidate.focus({ preventScroll: true });
    }
    const newLog = this.panel.querySelector(".perseus-log");
    if (newLog && logScroll != null) newLog.scrollTop = logScroll;
  };

  Gadget.prototype.renderLogin = function () {
    const box = make("section", "perseus-card");
    box.append(
      make("h3", "", "ورود به Perseus"),
      make("p", "", "برای ساخت و پیگیری ترجمه، با حساب ویکی‌مدیا وارد شوید."),
      button(
        "ورود با ویکی‌مدیا",
        () => this.startLogin(),
        "perseus-primary",
        "login",
        this.busy,
      ),
    );
    if (this.loginPopup) {
      box.append(
        make(
          "p",
          "perseus-muted",
          "پس از ورود، این پنجره خودکار به Perseus برمی‌گردد. اگر نشد، کد نمایش‌داده‌شده را وارد کنید.",
        ),
      );
    }
    const field = make("input", "perseus-code");
    field.type = "text";
    field.placeholder = "کد یک‌بارمصرف ورود";
    field.autocomplete = "off";
    field.dir = "ltr";
    field.setAttribute("aria-label", "کد یک‌بارمصرف ورود");
    field.dataset.focus = "manual-code";
    box.append(
      field,
      button(
        "ثبت کد ورود",
        () => void this.finishLogin(field.value),
        "perseus-button",
        "submit-code",
        this.busy,
      ),
    );
    return box;
  };

  Gadget.prototype.renderJob = function () {
    const job = this.currentJob;
    const box = make("section", "perseus-card");
    box.append(make("h3", "", "وضعیت ترجمه"));
    const heading = make("p", "perseus-job-title");
    heading.textContent =
      job.source.title + " ← " + (TARGETS[job.targetWiki] || job.targetWiki);
    heading.dir = "auto";
    box.append(heading);
    box.append(
      make("p", "", stageText(job.stage) + " · " + job.progress + "٪"),
    );
    const progress = make("progress", "perseus-progress");
    progress.max = 100;
    progress.value = Math.max(0, Math.min(100, Number(job.progress) || 0));
    progress.setAttribute("aria-label", "پیشرفت ترجمه");
    box.append(progress);
    if (job.counts && job.counts.totalChunks) {
      box.append(
        make(
          "p",
          "perseus-muted",
          job.counts.completedChunks +
            " از " +
            job.counts.totalChunks +
            " بخش پردازش شد.",
        ),
      );
    }
    if (job.error) {
      box.append(
        make(
          "p",
          "perseus-error",
          errorText(job.error) + " (" + job.error.code + ")",
        ),
      );
    }
    (job.warnings || []).forEach((warning) => {
      box.append(make("p", "perseus-note", warning));
    });
    const actions = make("div", "perseus-actions");
    if (ACTIVE.has(job.status)) {
      actions.append(
        button(
          "لغو ترجمه",
          () => void this.jobAction("cancel"),
          "perseus-button",
          "cancel",
          this.busy || job.status === "cancelling",
        ),
      );
    } else if (job.status === "failed") {
      actions.append(
        button(
          "تلاش دوباره",
          () => void this.jobAction("retry"),
          "perseus-primary",
          "retry",
          this.busy,
        ),
      );
    } else if (job.status === "completed" && job.outputAvailable) {
      box.append(
        make(
          "p",
          "perseus-success",
          "حالا نوبت بازبینی و ویراستاری متن توسط انسانه!",
        ),
      );
      box.append(
        make(
          "p",
          "perseus-muted",
          "این ویکی‌متن با هوش مصنوعی تولید شده و هنوز بازبینی نشده است.",
        ),
      );
      if (this.outputText === null) {
        box.append(
          make(
            "p",
            "perseus-muted",
            this.outputLoading
              ? "در حال آماده‌سازی خروجی…"
              : "دریافت خروجی انجام نشد.",
          ),
        );
        if (!this.outputLoading) {
          actions.append(
            button(
              "دریافت دوبارهٔ خروجی",
              () => void this.prepareOutput(),
              "perseus-button",
              "reload-output",
            ),
          );
        }
      } else {
        actions.append(
          button(
            "کپی ویکی‌متن",
            () => void this.copyOutput(),
            "perseus-primary",
            "copy",
            this.busy,
          ),
          button(
            "دانلود article.wiki",
            () => this.downloadOutput(),
            "perseus-button",
            "download",
            this.busy,
          ),
        );
      }
    } else if (job.status === "expired") {
      box.append(make("p", "perseus-note", "نتیجه منقضی شده است."));
    }
    if (!ACTIVE.has(job.status) && this.canInspect()) {
      actions.append(
        button(
          "ترجمهٔ تازهٔ مقالهٔ جاری",
          () => {
            this.setJob(null);
            this.target = null;
            this.selection = this.source
              ? defaultSelection(this.source.sections)
              : null;
            this.notice = "";
            this.render();
          },
          "perseus-link-button",
          "new-job",
          this.busy,
        ),
      );
    }
    box.append(actions);
    const details = make("details", "perseus-details");
    details.open = this.detailsOpen;
    const summary = make("summary", "", "نمایش جزئیات");
    summary.dataset.focus = "details";
    details.append(summary);
    const log = make("pre", "perseus-log");
    log.textContent = this.events.length
      ? this.events
          .map(
            (event) =>
              "[" +
              new Date(event.createdAt).toLocaleTimeString("fa-IR") +
              "] " +
              event.code +
              " — " +
              event.message +
              (event.data ? "\n" + JSON.stringify(event.data) : ""),
          )
          .join("\n")
      : "هنوز رویدادی ثبت نشده است.";
    details.append(log);
    details.addEventListener("toggle", () => {
      this.detailsOpen = details.open;
    });
    box.append(details);
    return box;
  };

  Gadget.prototype.renderSource = function () {
    const box = make("section", "perseus-card");
    box.append(make("h3", "", "ترجمهٔ مقالهٔ جاری"));
    if (!this.canInspect()) {
      box.append(
        make(
          "p",
          "perseus-note",
          "آغاز ترجمه فقط از مقالهٔ معمولیِ فضای نام اصلی ممکن است. ترجمهٔ فعال حساب را می‌توانید در بالا مدیریت کنید.",
        ),
      );
      return box;
    }
    const sourceTitle = make("p", "perseus-source-title", this.title);
    sourceTitle.dir = "auto";
    box.append(sourceTitle);
    if (this.sourceLoading)
      box.append(make("p", "perseus-muted", "در حال بررسی مقاله…"));
    if (this.source && !this.source.eligible) {
      const reasons = {
        namespace: "این صفحه در فضای نام مقاله نیست.",
        redirect: "صفحهٔ تغییرمسیر برای شروع ترجمه پشتیبانی نمی‌شود.",
        disambiguation: "صفحهٔ ابهام‌زدایی برای ترجمه پشتیبانی نمی‌شود.",
      };
      box.append(
        make(
          "p",
          "perseus-note",
          reasons[this.source.reason] ||
            "این مقاله برای ترجمه پشتیبانی نمی‌شود.",
        ),
      );
      return box;
    }
    if (!this.source || !this.selection) return box;
    box.append(make("p", "perseus-label", "زبان مقصد را انتخاب کنید:"));
    const targets = make("div", "perseus-targets");
    Object.keys(TARGETS).forEach((code) => {
      const control = button(
        TARGETS[code],
        () => {
          this.target = code;
          this.render();
          void this.inspectSource(code);
        },
        "perseus-target" + (this.target === code ? " is-selected" : ""),
        "target-" + code,
        this.busy || Boolean(this.activeJob),
      );
      control.setAttribute("aria-pressed", String(this.target === code));
      targets.append(control);
    });
    box.append(targets);
    const equivalentUrl =
      this.target &&
      this.inspectedTarget === this.target &&
      this.source.targetEquivalent &&
      this.source.targetEquivalent.found &&
      safeEquivalentUrl(this.source.targetEquivalent.url, this.target);
    if (equivalentUrl) {
      const equivalent = make("p", "perseus-note");
      equivalent.append("مقالهٔ معادل موجود است: ");
      const link = make("a", "", this.source.targetEquivalent.title);
      link.href = equivalentUrl;
      link.dir = "auto";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      equivalent.append(link);
      box.append(equivalent);
    }
    box.append(make("p", "perseus-label", "بخش‌های موردنظر:"));
    const lead = make("label", "perseus-lead");
    const leadInput = make("input");
    leadInput.type = "checkbox";
    leadInput.checked = this.selection.lead;
    leadInput.disabled = this.busy || Boolean(this.activeJob);
    leadInput.dataset.focus = "lead";
    leadInput.addEventListener("change", () => {
      this.selection.lead = leadInput.checked;
      this.render();
    });
    lead.append(leadInput, make("span", "", "متن ابتدایی مقاله (Lead)"));
    box.append(lead);
    const tree = make("ul", "perseus-tree");
    (this.source.sections || []).forEach((section) => {
      tree.append(this.renderSection(section));
    });
    box.append(tree);
    if (!hasSelectedContent(this.selection, this.source.sections)) {
      box.append(make("p", "perseus-note", "حداقل یک متن را انتخاب کنید."));
    }
    box.append(
      make(
        "p",
        "perseus-muted",
        "متن انتخاب‌شده برای پردازش به backend و سرویس هوش مصنوعی فرستاده می‌شود. خروجی را پیش از استفاده بازبینی کنید.",
      ),
    );
    box.append(
      button(
        "شروع ترجمه",
        () => void this.startJob(),
        "perseus-primary perseus-start",
        "start",
        !this.canStart(),
      ),
    );
    return box;
  };

  Gadget.prototype.renderSection = function (section) {
    const item = make("li", "perseus-section");
    const row = make("div", "perseus-section-row");
    const label = make("label", "perseus-section-label");
    const input = make("input");
    input.type = "checkbox";
    const state = branchState(this.selection, section);
    input.checked = state.all;
    input.indeterminate = state.some && !state.all;
    input.disabled = this.busy || Boolean(this.activeJob);
    input.dataset.focus = "section-" + section.id;
    input.addEventListener("change", () => {
      setBranch(this.selection, section, input.checked);
      this.render();
    });
    const sectionTitle = make("span", "", section.title || "بخش بی‌عنوان");
    sectionTitle.dir = "auto";
    label.append(input, sectionTitle);
    row.append(label);
    if (section.hasOwnText && section.children && section.children.length) {
      const own = make("label", "perseus-own-text");
      const ownInput = make("input");
      ownInput.type = "checkbox";
      const current = this.selection.sections[section.id];
      ownInput.checked = Boolean(
        current && current.selected && current.ownText,
      );
      ownInput.disabled = this.busy || Boolean(this.activeJob);
      ownInput.dataset.focus = "own-" + section.id;
      ownInput.addEventListener("change", () => {
        setOwnText(this.selection, section, ownInput.checked);
        this.render();
      });
      own.append(ownInput, make("span", "", "متن این بخش"));
      row.append(own);
    }
    item.append(row);
    if (section.children && section.children.length) {
      const children = make("ul", "perseus-tree");
      section.children.forEach((child) => {
        children.append(this.renderSection(child));
      });
      item.append(children);
    }
    return item;
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      sourceWikiFromHost: sourceWikiFromHost,
      sameSource: sameSource,
      defaultSelection: defaultSelection,
      setBranch: setBranch,
      setOwnText: setOwnText,
      branchState: branchState,
      hasSelectedContent: hasSelectedContent,
      apiBase: apiBase,
      safeEquivalentUrl: safeEquivalentUrl,
    };
  }

  if (typeof window !== "undefined" && window.mw && window.document) {
    if (
      sourceWikiFromHost(window.location.hostname) &&
      !document.getElementById("perseus-gadget-root")
    ) {
      window.mw.loader.using(["mediawiki.util"]).then(
        () => {
          if (document.getElementById("perseus-gadget-root")) return;
          try {
            new Gadget(window).mount();
          } catch (error) {
            window.mw.log.error("Perseus Gadget could not start", error);
          }
        },
        (error) => {
          window.mw.log.error("Perseus Gadget dependency failed", error);
        },
      );
    }
  }
})();
