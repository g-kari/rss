import { test, expect } from "@playwright/test";
import {
  clampTtsVolume,
  parseTtsVolume,
  TTS_VOLUME_DEFAULT,
  TTS_VOLUME_MAX,
  TTS_VOLUME_MIN,
} from "../src/lib/tts-volume";

test.describe("clampTtsVolume", () => {
  test("範囲内の有限数はそのまま返す", () => {
    expect(clampTtsVolume(0)).toBe(0);
    expect(clampTtsVolume(0.5)).toBe(0.5);
    expect(clampTtsVolume(0.75)).toBe(0.75);
    expect(clampTtsVolume(1.0)).toBe(1.0);
  });

  test("負数は MIN (0) にクランプ", () => {
    expect(clampTtsVolume(-0.5)).toBe(TTS_VOLUME_MIN);
    expect(clampTtsVolume(-100)).toBe(TTS_VOLUME_MIN);
  });

  test("1.0 超は MAX (1.0) にクランプ", () => {
    expect(clampTtsVolume(1.5)).toBe(TTS_VOLUME_MAX);
    expect(clampTtsVolume(100)).toBe(TTS_VOLUME_MAX);
  });

  test("NaN / Infinity はデフォルト (1.0) を返す", () => {
    expect(clampTtsVolume(NaN)).toBe(TTS_VOLUME_DEFAULT);
    expect(clampTtsVolume(Infinity)).toBe(TTS_VOLUME_DEFAULT);
    expect(clampTtsVolume(-Infinity)).toBe(TTS_VOLUME_DEFAULT);
  });

  test("数値以外 (文字列 / null / undefined / object) はデフォルト (1.0) を返す", () => {
    expect(clampTtsVolume("0.5")).toBe(TTS_VOLUME_DEFAULT);
    expect(clampTtsVolume(null)).toBe(TTS_VOLUME_DEFAULT);
    expect(clampTtsVolume(undefined)).toBe(TTS_VOLUME_DEFAULT);
    expect(clampTtsVolume({})).toBe(TTS_VOLUME_DEFAULT);
    expect(clampTtsVolume([])).toBe(TTS_VOLUME_DEFAULT);
    expect(clampTtsVolume(true)).toBe(TTS_VOLUME_DEFAULT);
  });

  test("境界値 (0 / 1.0) を正確に返す", () => {
    expect(clampTtsVolume(TTS_VOLUME_MIN)).toBe(0);
    expect(clampTtsVolume(TTS_VOLUME_MAX)).toBe(1);
  });
});

test.describe("parseTtsVolume", () => {
  test("数値文字列を parse して clamp する", () => {
    expect(parseTtsVolume("0")).toBe(0);
    expect(parseTtsVolume("0.5")).toBe(0.5);
    expect(parseTtsVolume("1")).toBe(1);
    expect(parseTtsVolume("1.0")).toBe(1);
  });

  test("範囲外の数値文字列は clamp される", () => {
    expect(parseTtsVolume("-1")).toBe(TTS_VOLUME_MIN);
    expect(parseTtsVolume("2")).toBe(TTS_VOLUME_MAX);
  });

  test("空文字 / null / undefined はデフォルト (1.0) を返す", () => {
    expect(parseTtsVolume("")).toBe(TTS_VOLUME_DEFAULT);
    expect(parseTtsVolume(null)).toBe(TTS_VOLUME_DEFAULT);
    expect(parseTtsVolume(undefined)).toBe(TTS_VOLUME_DEFAULT);
  });

  test("parseFloat できない文字列はデフォルト (1.0) を返す", () => {
    expect(parseTtsVolume("abc")).toBe(TTS_VOLUME_DEFAULT);
    expect(parseTtsVolume("not a number")).toBe(TTS_VOLUME_DEFAULT);
  });

  test("数値先頭文字列は parseFloat 標準挙動で先頭数値部分を採用", () => {
    // parseFloat("0.5abc") === 0.5 — Web Speech API 妥当値なので clamp も影響なし
    expect(parseTtsVolume("0.5abc")).toBe(0.5);
  });
});
