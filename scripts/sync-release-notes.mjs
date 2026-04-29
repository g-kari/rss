// RELEASE_NOTES.md → src/lib/release-notes-data.ts を自動生成する
import { readFileSync, writeFileSync } from "fs";

const md = readFileSync("RELEASE_NOTES.md", "utf8");
const out = `// @generated from RELEASE_NOTES.md — do not edit directly
export const RELEASE_NOTES_MARKDOWN = ${JSON.stringify(md)};\n`;

writeFileSync("src/lib/release-notes-data.ts", out);
