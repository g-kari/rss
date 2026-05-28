/**
 * Theme preset (#案 B localStorage 永続化)
 *
 * 「ダーク + serif + サイズ大 + 行間広め」のような複数設定の組み合わせを
 * 1 つの preset として名前付け保存・呼び出しする機能の純粋関数層。
 *
 * - parseThemePresets: localStorage の生 string を ThemePreset[] に安全 parse
 *   (不正値 / 欠落 field は safe fallback、配列でない場合は [] 返却、
 *    各 entry の field 型不正は skip、重複 id は後勝ち)
 * - serializeThemePresets: ThemePreset[] を JSON string にシリアライズ
 *   (上限 MAX_THEME_PRESETS=20 件、超過分は古い順に切り捨て)
 */

import type { FontSize, FontFamily } from "../types";
import { FONT_SIZE_CYCLE, FONT_FAMILY_CYCLE } from "./article-utils";
import type { LineHeight, ContentWidth } from "./reader-settings";
import { LINE_HEIGHT_CYCLE, CONTENT_WIDTH_CYCLE } from "./reader-settings";
import type { Theme } from "../hooks/useThemePreference";

/** 1 preset として保存できる設定値の組み合わせ */
export interface ThemePreset {
  /** crypto.randomUUID() で生成された unique id */
  id: string;
  /** ユーザー指定の名前 (1-30 char) */
  name: string;
  theme: Theme;
  fontSize: FontSize;
  fontFamily: FontFamily;
  lineHeight: LineHeight;
  contentWidth: ContentWidth;
  /** 保存時刻 (Date.now() のミリ秒 epoch) */
  createdAt: number;
}

/** preset 名の最小 / 最大文字数 */
export const THEME_PRESET_NAME_MIN_LENGTH = 1;
export const THEME_PRESET_NAME_MAX_LENGTH = 30;

/** localStorage に保存できる preset の上限 (これを超えると serialize で古い順に切り捨て) */
export const MAX_THEME_PRESETS = 20;

const THEME_VALUES: readonly Theme[] = ["light", "dark"] as const;

function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEME_VALUES as readonly string[]).includes(v);
}

function isFontSize(v: unknown): v is FontSize {
  return typeof v === "string" && (FONT_SIZE_CYCLE as readonly string[]).includes(v);
}

function isFontFamily(v: unknown): v is FontFamily {
  return typeof v === "string" && (FONT_FAMILY_CYCLE as readonly string[]).includes(v);
}

function isLineHeight(v: unknown): v is LineHeight {
  return typeof v === "string" && (LINE_HEIGHT_CYCLE as readonly string[]).includes(v);
}

function isContentWidth(v: unknown): v is ContentWidth {
  return typeof v === "string" && (CONTENT_WIDTH_CYCLE as readonly string[]).includes(v);
}

function isValidName(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length >= THEME_PRESET_NAME_MIN_LENGTH &&
    v.length <= THEME_PRESET_NAME_MAX_LENGTH
  );
}

function isValidId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * 1 entry を ThemePreset に変換。不正値は null を返す。
 * (`parseThemePresets` から各 entry の validation に利用)
 */
function parseThemePresetEntry(raw: unknown): ThemePreset | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isValidId(r.id)) return null;
  if (!isValidName(r.name)) return null;
  if (!isTheme(r.theme)) return null;
  if (!isFontSize(r.fontSize)) return null;
  if (!isFontFamily(r.fontFamily)) return null;
  if (!isLineHeight(r.lineHeight)) return null;
  if (!isContentWidth(r.contentWidth)) return null;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return null;
  return {
    id: r.id,
    name: r.name,
    theme: r.theme,
    fontSize: r.fontSize,
    fontFamily: r.fontFamily,
    lineHeight: r.lineHeight,
    contentWidth: r.contentWidth,
    createdAt: r.createdAt,
  };
}

/**
 * localStorage 生 string を ThemePreset[] に safe parse する。
 *
 * - null / 空文字 / 不正 JSON → []
 * - 配列でない (object / primitive) → []
 * - 配列内で entry が不正 → 該当 entry skip
 * - 重複 id → 後勝ち (後の entry が前の entry を上書き)
 */
export function parseThemePresets(raw: string | null | undefined): ThemePreset[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const byId = new Map<string, ThemePreset>();
  for (const entry of parsed) {
    const preset = parseThemePresetEntry(entry);
    if (preset === null) continue;
    // 重複 id は後勝ち (Map.set で上書き)
    byId.set(preset.id, preset);
  }
  return [...byId.values()];
}

/**
 * ThemePreset[] を JSON string にシリアライズする。
 *
 * - MAX_THEME_PRESETS (20) 件超過時は createdAt 昇順で古い順に切り捨て
 *   (新しい preset を残す、ユーザーが最近作ったものを優先)
 * - 入力配列を直接 mutate しない
 */
export function serializeThemePresets(presets: readonly ThemePreset[]): string {
  let limited: readonly ThemePreset[] = presets;
  if (presets.length > MAX_THEME_PRESETS) {
    const sorted = [...presets].sort((a, b) => b.createdAt - a.createdAt);
    limited = sorted.slice(0, MAX_THEME_PRESETS);
  }
  return JSON.stringify(limited);
}
