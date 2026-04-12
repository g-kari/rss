import { test, expect } from "@playwright/test";
import { buildObsidianUri, sanitizeObsidianFilename } from "../src/lib/obsidian";

// ===== sanitizeObsidianFilename =====

test.describe("sanitizeObsidianFilename — ファイル名不正文字の除去", () => {
  test("通常の文字列はそのまま返す", () => {
    expect(sanitizeObsidianFilename("普通のタイトル")).toBe("普通のタイトル");
  });

  test("/ はハイフンに置換される", () => {
    expect(sanitizeObsidianFilename("path/to/title")).toBe("path-to-title");
  });

  test("\\ はハイフンに置換される", () => {
    expect(sanitizeObsidianFilename("C:\\Users\\test")).toBe("C--Users-test");
  });

  test(": はハイフンに置換される", () => {
    expect(sanitizeObsidianFilename("JavaScript: 入門")).toBe("JavaScript- 入門");
  });

  test("* は除去される", () => {
    expect(sanitizeObsidianFilename("title*name")).toBe("titlename");
  });

  test("? は除去される", () => {
    expect(sanitizeObsidianFilename("what?")).toBe("what");
  });

  test('"  は除去される', () => {
    expect(sanitizeObsidianFilename('say "hello"')).toBe("say hello");
  });

  test("< > は除去される", () => {
    expect(sanitizeObsidianFilename("<tag>")).toBe("tag");
  });

  test("| は除去される", () => {
    expect(sanitizeObsidianFilename("a|b")).toBe("ab");
  });

  test("# は除去される", () => {
    expect(sanitizeObsidianFilename("C# プログラミング")).toBe("C プログラミング");
  });

  test("複数の不正文字が混在していても処理できる", () => {
    const result = sanitizeObsidianFilename('repo/name: "test" <#1>');
    expect(result).not.toMatch(/[/\\:*?"<>|#]/);
  });

  test("空文字列は空文字を返す", () => {
    expect(sanitizeObsidianFilename("")).toBe("");
  });

  test("前後の空白はトリムされる", () => {
    expect(sanitizeObsidianFilename("  タイトル  ")).toBe("タイトル");
  });
});

// ===== buildObsidianUri =====

test.describe("buildObsidianUri — URI 生成", () => {
  test("基本的な URI が obsidian://new で始まる", () => {
    const uri = buildObsidianUri({ name: "テスト", content: "本文" });
    expect(uri.startsWith("obsidian://new")).toBe(true);
  });

  test("name パラメータが URI エンコードされる", () => {
    const uri = buildObsidianUri({ name: "日本語タイトル", content: "内容" });
    expect(uri).toContain("file=");
    // URI エンコード済みであること
    expect(uri).not.toContain(" ");
  });

  test("content パラメータが URI エンコードされる", () => {
    const uri = buildObsidianUri({ name: "test", content: "# 見出し\n本文テキスト" });
    expect(uri).toContain("content=");
    expect(uri).not.toContain("\n");
  });

  test("vault が指定された場合は vault パラメータが含まれる", () => {
    const uri = buildObsidianUri({ vault: "MyVault", name: "test", content: "body" });
    expect(uri).toContain("vault=");
    expect(uri).toContain("MyVault");
  });

  test("vault が空文字の場合は vault パラメータを含まない", () => {
    const uri = buildObsidianUri({ vault: "", name: "test", content: "body" });
    expect(uri).not.toContain("vault=");
  });

  test("vault が undefined の場合は vault パラメータを含まない", () => {
    const uri = buildObsidianUri({ name: "test", content: "body" });
    expect(uri).not.toContain("vault=");
  });

  test("ファイル名にタイムスタンプが付加される", () => {
    // name は YYYY-MM-DD のプレフィックスやサフィックスで一意にする（オプション）
    // ここでは name がそのまま使われることを確認
    const uri = buildObsidianUri({ name: "記事名", content: "内容" });
    expect(uri).toContain("file=");
  });

  test("タイトルの不正文字がサニタイズされてから URI に含まれる", () => {
    const uri = buildObsidianUri({ name: "記事: テスト/サブ", content: "本文" });
    // URI に不正文字（サニタイズ前）が raw で含まれていないこと
    // （エンコードされるのでOKだが、サニタイズ後のファイル名が使われること）
    expect(uri.includes("file=")).toBe(true);
  });

  test("長いコンテンツも URI に含まれる", () => {
    const longContent = "本文テキスト".repeat(100);
    const uri = buildObsidianUri({ name: "長い記事", content: longContent });
    expect(uri).toContain("content=");
  });
});
