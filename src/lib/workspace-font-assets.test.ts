import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceFonts } from "../../e2e/helpers/workspace-fonts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(css: string) {
  const root = await mkdtemp(join(tmpdir(), "rss-font-test-"));
  roots.push(root);
  await mkdir(join(root, "chunks"));
  await mkdir(join(root, "media"));
  await writeFile(join(root, "chunks", "app.css"), css);
  return root;
}
it("extracts only font faces/variables and serves exact public build bytes", async () => {
  const root = await fixture(
    '@font-face{font-family:"Reddit Sans";src:url(../media/reddit.woff2)}.font{--loaded-reddit-sans:"Reddit Sans";--loaded-ibm-plex-sans-jp:"IBM Plex Sans JP"}.danger{color:red}',
  );
  await writeFile(join(root, "media", "reddit.woff2"), "synthetic font bytes");
  const result = await workspaceFonts(root);
  expect(result.css).toContain('url("/_next/static/media/reddit.woff2")');
  expect(result.css).toContain('--loaded-ibm-plex-sans-jp:"IBM Plex Sans JP"');
  expect(result.css).not.toContain(".danger");
  expect(result.files.get("/_next/static/media/reddit.woff2")?.toString()).toBe(
    "synthetic font bytes",
  );
});
it("fails rather than silently accepting missing production fonts", async () => {
  const root = await fixture("body{color:red}");
  await expect(workspaceFonts(root)).rejects.toThrow("font definitions missing");
});
