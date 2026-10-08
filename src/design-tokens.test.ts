import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
const lightBlock = css.slice(0, css.indexOf('[data-theme="dark"]'));

describe("design tokens (#1382 #1384 #1386 #1387)", () => {
  it.each(["accent", "accent-hover", "accent-subtle", "accent-contrast", "surface-nav"])(
    "defines --color-%s for light and dark themes",
    (name) => {
      expect(lightBlock).toContain(`--color-${name}:`);
      expect(darkBlock).toContain(`--color-${name}:`);
    },
  );

  it("keeps selection tokens as aliases of the accent tokens", () => {
    expect(lightBlock).toContain("--color-selection-accent: var(--color-accent)");
    expect(lightBlock).toContain("--color-selection-surface: var(--color-accent-subtle)");
  });

  it("defines the type scale with 10px limited to badge", () => {
    expect(lightBlock).toContain("--text-badge: 0.625rem");
    expect(lightBlock).toContain("--text-meta: 0.6875rem");
    expect(lightBlock).toContain("--text-control: 0.75rem");
    expect(lightBlock).toContain("--text-reader-title: clamp(1.5rem");
  });

  it("defines a three-step motion scale and three easings", () => {
    for (const token of [
      "--motion-fast: 150ms",
      "--motion-standard: 200ms",
      "--motion-slow: 300ms",
      "--ease-interaction:",
      "--ease-entrance:",
      "--ease-exit:",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("stops transform-based entrances but keeps spinners under reduced motion", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.animate-slide-in-right[\s\S]*animation: none !important/);
    expect(reduced).toMatch(/\.animate-spin\s*\{[^}]*animation-iteration-count: infinite/);
  });
});
