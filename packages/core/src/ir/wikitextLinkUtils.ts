export function normalizeTitle(title: string): string {
  return title.replaceAll("_", " ").trim();
}

export function escapeWikitextPositionalParam(value: string): string {
  return value.replaceAll("|", "{{!}}").replaceAll("=", "{{=}}");
}

export function renderInterwikiTemplateCall(
  templateName: string,
  label: string,
  target: string,
): string {
  const safeLabel = escapeWikitextPositionalParam(label);
  const safeTarget = escapeWikitextPositionalParam(target);
  return `{{${templateName}|${safeLabel}|${safeTarget}}}`;
}

export function stripFragment(decodedTitle: string): {
  title: string;
  fragment: string | null;
} {
  const hashIndex = decodedTitle.indexOf("#");
  if (hashIndex === -1) {
    return { title: decodedTitle, fragment: null };
  }
  return {
    title: decodedTitle.slice(0, hashIndex),
    fragment: decodedTitle.slice(hashIndex + 1) || null,
  };
}

export interface TemplateLinkResolution {
  resolvedTarget: string | null;

  fallbackTemplateName: string | null;
}

export interface InterwikiTemplateDataMw {
  parts: [
    {
      template: {
        target: { wt: string; href: string };
        params: { "1": { wt: string }; "2": { wt: string } };
        i: 0;
      };
    },
  ];
}

export function buildInterwikiTemplateDataMw(
  templateName: string,
  label: string,
  target: string,
): InterwikiTemplateDataMw {
  return {
    parts: [
      {
        template: {
          target: { wt: templateName, href: `./Template:${templateName}` },
          params: {
            "1": { wt: label },
            "2": { wt: target },
          },
          i: 0,
        },
      },
    ],
  };
}
