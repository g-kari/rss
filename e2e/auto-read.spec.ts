import { test, expect } from "@playwright/test";
import {
  isAutoReadFinished,
  shouldTriggerAutoFetch,
  shouldStartAutoSpeak,
} from "../src/lib/auto-read";

test.describe("isAutoReadFinished", () => {
  test("playing → not playing の遷移で完了とみなす", () => {
    expect(
      isAutoReadFinished({
        enabled: true,
        ttsSupported: true,
        prevPlaying: true,
        currentPlaying: false,
        paused: false,
      }),
    ).toBe(true);
  });

  test("オートモード OFF なら完了判定しない", () => {
    expect(
      isAutoReadFinished({
        enabled: false,
        ttsSupported: true,
        prevPlaying: true,
        currentPlaying: false,
        paused: false,
      }),
    ).toBe(false);
  });

  test("TTS 非対応なら完了判定しない", () => {
    expect(
      isAutoReadFinished({
        enabled: true,
        ttsSupported: false,
        prevPlaying: true,
        currentPlaying: false,
        paused: false,
      }),
    ).toBe(false);
  });

  test("一時停止中は完了とみなさない", () => {
    expect(
      isAutoReadFinished({
        enabled: true,
        ttsSupported: true,
        prevPlaying: true,
        currentPlaying: false,
        paused: true,
      }),
    ).toBe(false);
  });

  test("再生中 → 再生中は完了ではない", () => {
    expect(
      isAutoReadFinished({
        enabled: true,
        ttsSupported: true,
        prevPlaying: true,
        currentPlaying: true,
        paused: false,
      }),
    ).toBe(false);
  });

  test("停止中 → 再生中は完了ではない（再生開始）", () => {
    expect(
      isAutoReadFinished({
        enabled: true,
        ttsSupported: true,
        prevPlaying: false,
        currentPlaying: true,
        paused: false,
      }),
    ).toBe(false);
  });
});

test.describe("shouldTriggerAutoFetch", () => {
  test("オートモード ON + canFetch + hasContent なし → trigger", () => {
    expect(
      shouldTriggerAutoFetch({
        enabled: true,
        canFetch: true,
        fetching: false,
        hasContent: false,
      }),
    ).toBe(true);
  });

  test("既に hasContent ありなら trigger しない", () => {
    expect(
      shouldTriggerAutoFetch({
        enabled: true,
        canFetch: true,
        fetching: false,
        hasContent: true,
      }),
    ).toBe(false);
  });

  test("fetching 中は trigger しない（重複防止）", () => {
    expect(
      shouldTriggerAutoFetch({
        enabled: true,
        canFetch: true,
        fetching: true,
        hasContent: false,
      }),
    ).toBe(false);
  });

  test("canFetch=false なら trigger しない", () => {
    expect(
      shouldTriggerAutoFetch({
        enabled: true,
        canFetch: false,
        fetching: false,
        hasContent: false,
      }),
    ).toBe(false);
  });

  test("オートモード OFF なら trigger しない", () => {
    expect(
      shouldTriggerAutoFetch({
        enabled: false,
        canFetch: true,
        fetching: false,
        hasContent: false,
      }),
    ).toBe(false);
  });
});

test.describe("shouldStartAutoSpeak", () => {
  test("オートモード ON + 非再生 + テキストあり + 非フェッチ中 → start", () => {
    expect(
      shouldStartAutoSpeak({
        enabled: true,
        ttsSupported: true,
        ttsPlaying: false,
        ttsPaused: false,
        fetching: false,
        hasText: true,
      }),
    ).toBe(true);
  });

  test("既に再生中なら start しない", () => {
    expect(
      shouldStartAutoSpeak({
        enabled: true,
        ttsSupported: true,
        ttsPlaying: true,
        ttsPaused: false,
        fetching: false,
        hasText: true,
      }),
    ).toBe(false);
  });

  test("一時停止中なら start しない", () => {
    expect(
      shouldStartAutoSpeak({
        enabled: true,
        ttsSupported: true,
        ttsPlaying: false,
        ttsPaused: true,
        fetching: false,
        hasText: true,
      }),
    ).toBe(false);
  });

  test("フェッチ中なら start しない（コンテンツ完成待ち）", () => {
    expect(
      shouldStartAutoSpeak({
        enabled: true,
        ttsSupported: true,
        ttsPlaying: false,
        ttsPaused: false,
        fetching: true,
        hasText: true,
      }),
    ).toBe(false);
  });

  test("テキストなしなら start しない", () => {
    expect(
      shouldStartAutoSpeak({
        enabled: true,
        ttsSupported: true,
        ttsPlaying: false,
        ttsPaused: false,
        fetching: false,
        hasText: false,
      }),
    ).toBe(false);
  });

  test("TTS 非対応なら start しない", () => {
    expect(
      shouldStartAutoSpeak({
        enabled: true,
        ttsSupported: false,
        ttsPlaying: false,
        ttsPaused: false,
        fetching: false,
        hasText: true,
      }),
    ).toBe(false);
  });
});
