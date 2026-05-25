// Turbopack `resolveAlias` で browser bundle のみ Node.js builtin (`fs` / `path`) を
// 空 mock に向けるために使う (#753 Phase 2c)。
//
// `piper-plus` の内部 chunk (Emscripten 生成 wasm ラッパー) は
// `if (ENVIRONMENT_IS_NODE) { var fs = require("fs"); var nodePath = require("path"); }` の
// Node.js fallback 分岐を含み、browser runtime では `ENVIRONMENT_IS_NODE === false` で
// dead code 化されるが、Turbopack の静的解析が `require("fs")` を解決しようとして
// `Module not found` を出して build / e2e 起動を壊す。
//
// 本 empty module を `next.config.ts` の `turbopack.resolveAlias: { fs: { browser: ... } }`
// に指定することで、Turbopack が browser bundle 解決時に本ファイルを返し、build を通す。
// 実行時には Emscripten 分岐ガードで本 module へのアクセス自体が発生しない。
module.exports = {};
