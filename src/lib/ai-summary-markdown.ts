import { Marked, type Tokens } from "marked";
import { escapeHtml, sanitizeHtml, unescapeHtml } from "./html";
import { isAbsoluteHttpUrl } from "./url";

/**
 * Chrome / Workers AI / cached summaries share this display-only renderer.
 * Raw HTML remains literal text and images never load external resources.
 * Keep the #811 non-string guard; do not mutate the cached source text.
 */
export function renderSummaryHtml(text: unknown): string {
  if (typeof text !== "string" || !text.trim()) return "";

  // Use an isolated parser: article-content Markdown settings must not change.
  const markdown = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      html: ({ text: html }) => escapeHtml(html),
      image: ({ text: alt }) => escapeHtml(alt),
      checkbox: ({ checked }) => (checked ? "☑ " : "☐ "),
      link({ href, tokens }) {
        const label = this.parser.parseInline(tokens);
        const url = unescapeHtml(href);
        // Only explicit web links; never navigate to an app-relative/API path.
        if (!isAbsoluteHttpUrl(url)) return label;
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      },
    },
    extensions: [
      {
        name: "summaryBullets",
        level: "block",
        start: (source) => source.match(/^[・•][\t ]+/m)?.index,
        tokenizer(source): Tokens.List | undefined {
          // Retain legacy Japanese bullets without rewriting fenced/inline code.
          const match = /^(?:[・•][\t ]+[^\n]*(?:\n|$))+/.exec(source);
          if (!match) return;
          return {
            type: "list",
            raw: match[0],
            ordered: false,
            start: "",
            loose: false,
            items: match[0]
              .trimEnd()
              .split("\n")
              .map((line) => {
                const content = line.replace(/^[・•][\t ]+/, "");
                return {
                  type: "list_item",
                  raw: line,
                  text: content,
                  task: false,
                  loose: false,
                  tokens: [
                    {
                      type: "text",
                      raw: content,
                      text: content,
                      tokens: this.lexer.inlineTokens(content),
                    },
                  ],
                };
              }),
          };
        },
      },
    ],
  });
  // Keep the repository sanitizer as the last defense-in-depth step.
  return sanitizeHtml(markdown.parse(text, { async: false }));
}
