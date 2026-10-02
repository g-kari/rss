import { describe, expect, it } from "vitest";
import { SETTINGS_CATEGORIES, SETTINGS_CATALOG, searchSettings } from "./settings-catalog";

describe("local settings catalog", () => {
  it("gives every setting one unique destination and category", () => {
    expect(new Set(SETTINGS_CATALOG.map((setting) => setting.id)).size).toBe(
      SETTINGS_CATALOG.length,
    );
    for (const setting of SETTINGS_CATALOG) {
      expect(SETTINGS_CATEGORIES.some((category) => category.id === setting.category)).toBe(true);
      expect(setting.label).not.toBe("");
      expect(setting.description).not.toBe("");
    }
  });
  it("searches Japanese labels, descriptions and aliases with normalized AND terms", () => {
    expect(searchSettings("　文字　大きさ　").map((setting) => setting.id)).toContain("font-size");
    expect(searchSettings("文字サイズ").map((setting) => setting.id)).toEqual(["font-size"]);
    expect(searchSettings("ＴＴＬ").map((setting) => setting.id)).toContain("retention");
    expect(searchSettings("download folder").map((setting) => setting.id)).toContain(
      "image-folder",
    );
    expect(searchSettings("JSON メモ").map((setting) => setting.id)).toEqual(["notes-import"]);
    expect(searchSettings("自動 scroll").map((setting) => setting.id)).toEqual(["gallery-scroll"]);
  });
  it("handles no results and treats cleared or whitespace-only queries as category navigation", () => {
    expect(searchSettings("該当しない設定xyz")).toEqual([]);
    expect(searchSettings("")).toEqual([]);
    expect(searchSettings("　 \n")).toEqual([]);
  });
});
