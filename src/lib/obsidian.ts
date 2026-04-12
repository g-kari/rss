/**
 * Obsidian URI スキーム連携ユーティリティ
 *
 * obsidian://new URI を生成してブラウザから Obsidian に記事を送る。
 * 参考: https://help.obsidian.md/Extending+Obsidian/Obsidian+URI
 */

// ===== ファイル名サニタイズ =====

/**
 * Obsidian（および Windows/macOS）で使えないファイル名文字を除去・置換する。
 *
 * 除去対象: * ? " < > | #
 * ハイフンに置換: / \ :
 */
export function sanitizeObsidianFilename(name: string): string {
  return name
    .replace(/[/\\:]/g, "-") // スラッシュ・バックスラッシュ・コロン → ハイフン
    .replace(/[*?"<>|#]/g, "") // その他不正文字を除去
    .trim();
}

// ===== URI 生成 =====

interface ObsidianUriOptions {
  /** Obsidian Vault 名（省略時は vault パラメータなし） */
  vault?: string;
  /** 保存するノートのファイル名（拡張子なし） */
  name: string;
  /** ノートの本文（Markdown） */
  content: string;
}

/**
 * Obsidian の `obsidian://new` URI を生成する。
 *
 * ブラウザで `window.open(uri)` または `<a href={uri}>` で開くと
 * Obsidian が起動して新規ノートが作成される。
 *
 * @param options - vault / name / content
 * @returns `obsidian://new?...` 形式の URI 文字列
 */
export function buildObsidianUri(options: ObsidianUriOptions): string {
  const { vault, name, content } = options;

  const params = new URLSearchParams();

  if (vault) {
    params.set("vault", vault);
  }

  // ファイル名サニタイズしてから設定
  params.set("file", sanitizeObsidianFilename(name));
  params.set("content", content);

  return `obsidian://new?${params.toString()}`;
}
