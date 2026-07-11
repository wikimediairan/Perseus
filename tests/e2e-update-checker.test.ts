/**
 * Verifies the update-notification feature's core logic:
 *   - semantic version comparison (including prerelease precedence)
 *   - checkForUpdates: detects a newer release, recognizes "already
 *     current", and — critically — fails completely silently on any
 *     network problem, never throwing.
 *
 * No DOM/linkedom needed here — this module is plain fetch + JSON, no
 * HTML parsing involved.
 */

describe("Update Checker (E2E)", () => {
  it("compareVersions / isNewerVersion", async () => {
    const { compareVersions, isNewerVersion } = await import("@/services/updateChecker");

    expect(compareVersions("1.2.3", "1.2.3"), "1.2.3 vs 1.2.3 -> equal").toBe(0);
    expect(compareVersions("1.3.0", "1.2.9") > 0, "1.3.0 > 1.2.9 (minor beats patch)").toBe(true);
    expect(compareVersions("2.0.0", "1.9.9") > 0, "2.0.0 > 1.9.9 (major beats everything)").toBe(true);
    expect(compareVersions("1.2.4", "1.2.3") > 0, "1.2.4 > 1.2.3 (patch)").toBe(true);
    expect(compareVersions("v1.2.3", "1.2.3"), "v1.2.3 vs 1.2.3 -> equal (leading 'v' ignored)").toBe(0);
    expect(compareVersions("1.2.3", "1.2.3-beta") > 0, "1.2.3 > 1.2.3-beta (prerelease is older)").toBe(true);
    expect(compareVersions("1.2.3-alpha", "1.2.3-beta") < 0, "1.2.3-alpha < 1.2.3-beta (lexicographic prerelease)").toBe(true);
    expect(isNewerVersion("1.1.0", "1.0.0"), "isNewerVersion(latest, current) true case").toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0"), "isNewerVersion(latest, current) false when equal").toBe(false);
    expect(isNewerVersion("1.0.0", "1.1.0"), "isNewerVersion(latest, current) false when current is ahead").toBe(false);
  });

  it("checkForUpdates detects a newer GitHub release", async () => {
    (globalThis as any).fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            tag_name: "v2.5.0",
            html_url: "https://github.com/perseus-app/perseus/releases/tag/v2.5.0",
            body: "First paragraph of release notes.\n\nSecond paragraph should be dropped.",
          }),
      }) as Response;

    const { checkForUpdates } = await import("@/services/updateChecker");
    const result = await checkForUpdates("2.4.0");

    expect(result.available, "available is true").toBe(true);
    expect(result.latestVersion, "latestVersion has no 'v' prefix").toBe("2.5.0");
    expect(result.currentVersion, "currentVersion echoed back").toBe("2.4.0");
    expect(result.releaseUrl, "releaseUrl passed through").toBe("https://github.com/perseus-app/perseus/releases/tag/v2.5.0");
    expect(result.releaseNotes, "releaseNotes is only the first paragraph").toBe("First paragraph of release notes.");
  });

  it("checkForUpdates reports no update when already current or ahead", async () => {
    (globalThis as any).fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tag_name: "1.0.0", html_url: "https://x", body: null }),
      }) as Response;

    const { checkForUpdates } = await import("@/services/updateChecker");
    const same = await checkForUpdates("1.0.0");
    const ahead = await checkForUpdates("1.1.0");

    expect(same.available, "equal version -> not available").toBe(false);
    expect(ahead.available, "current ahead of 'latest' -> not available").toBe(false);
  });

  it("network failure resolves to 'not available', never throws", async () => {
    (globalThis as any).fetch = async () => {
      throw new Error("network is down");
    };

    const { checkForUpdates } = await import("@/services/updateChecker");
    let threw = false;
    let result: Awaited<ReturnType<typeof checkForUpdates>> | undefined;
    try {
      result = await checkForUpdates("1.0.0");
    } catch {
      threw = true;
    }

    expect(threw, "did not throw").toBe(false);
    expect(result?.available, "resolved to available: false").toBe(false);
  });

  it("non-2xx response and malformed JSON both resolve silently", async () => {
    const { checkForUpdates } = await import("@/services/updateChecker");

    (globalThis as any).fetch = async () => ({ ok: false, status: 404, json: () => Promise.resolve({}) }) as Response;
    const notFoundResult = await checkForUpdates("1.0.0");

    (globalThis as any).fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: () => {
          throw new SyntaxError("bad json");
        },
      }) as unknown as Response;
    const badJsonResult = await checkForUpdates("1.0.0");

    (globalThis as any).fetch = async () => ({ ok: true, status: 200, json: () => Promise.resolve({ tag_name: 123 }) }) as Response;
    const wrongShapeResult = await checkForUpdates("1.0.0");

    expect(notFoundResult.available, "404 response -> not available, no throw").toBe(false);
    expect(badJsonResult.available, "malformed JSON -> not available, no throw").toBe(false);
    expect(wrongShapeResult.available, "wrong-shaped JSON -> not available, no throw").toBe(false);
  });
});
