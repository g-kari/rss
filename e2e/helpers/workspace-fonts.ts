import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import postcss, { type AtRule } from "postcss";

/** Read only public CSS/woff2 from the already-required production build. */
export async function workspaceFonts(assetRoot?: string) {
  if (!assetRoot) {
    if (process.env.CI) throw new Error("CI must supply same-build public font assets");
    return {
      css: ":root{--loaded-reddit-sans:system-ui;--loaded-ibm-plex-sans-jp:system-ui}",
      files: new Map<string, Buffer>(),
      provenance: "Explicit system fallback (local fixture only)",
    };
  }
  const candidates: AtRule[] = [];
  const variables = new Map<string, string>();
  for (const name of await readdir(join(assetRoot, "chunks"))) {
    if (!name.endsWith(".css")) continue;
    const tree = postcss.parse(await readFile(join(assetRoot, "chunks", name), "utf8"));
    tree.walkAtRules("font-face", (rule) => {
      candidates.push(rule);
    });
    tree.walkDecls(/^--loaded-(reddit-sans|ibm-plex-sans-jp)$/, (decl) => {
      variables.set(decl.prop, decl.value);
    });
  }
  // KaTeX also emits font-face rules (including woff/ttf); comparison text uses only Next fonts.
  const families = new Set(
    [...variables.values()].flatMap((value) =>
      value.split(",").map((family) => family.trim().replace(/^["']|["']$/g, "")),
    ),
  );
  const faces = new Set<string>();
  for (const rule of candidates) {
    rule.walkDecls("font-family", (decl) => {
      if (families.has(decl.value.trim().replace(/^["']|["']$/g, ""))) faces.add(rule.toString());
    });
  }
  if (variables.size !== 2 || faces.size === 0)
    throw new Error("Production Reddit Sans / IBM Plex Sans JP font definitions missing");
  const files = new Map<string, Buffer>();
  let css = [...faces].join("\n");
  const names = new Set<string>();
  css = css.replace(/url\((?:["']?)([^)"']+)(?:["']?)\)/g, (_match, url: string) => {
    const name = basename(url.split("?")[0]);
    if (!/^[\w.-]+\.woff2$/.test(name)) throw new Error("Unexpected public font URL");
    names.add(name);
    return `url("/_next/static/media/${name}")`;
  });
  for (const name of names)
    files.set(`/_next/static/media/${name}`, await readFile(join(assetRoot, "media", name)));
  css += `\n:root{${[...variables].map(([name, value]) => `${name}:${value}`).join(";")}}`;
  return { css, files, provenance: "Same-CI-head production Next self-hosted fonts" };
}
