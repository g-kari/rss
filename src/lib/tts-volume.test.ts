import { describe, expect, it } from "vitest";
import { cycleTtsVolume } from "./tts-volume";

describe("cycleTtsVolume (#727 本人指定の10%刻み)", () => {
  it.each([
    [1, 0.9],
    [0.9, 0.8],
    [0.8, 0.7],
    [0.7, 0.6],
    [0.6, 0.5],
    [0.5, 0.4],
    [0.4, 0.3],
    [0.3, 0.2],
    [0.2, 0.1],
    [0.1, 0],
    [0, 1],
  ])("%s の次は %s", (current, next) => {
    expect(cycleTtsVolume(current)).toBe(next);
  });

  it.each([
    [0.83, 0.73],
    [0.33, 0.23],
    [0.11, 0.01],
    [0.09, 0],
    [0.01, 0],
    [0.004, 0],
  ])("設定スライダーの %s から10ポイント下げる", (current, next) => {
    expect(cycleTtsVolume(current)).toBe(next);
  });

  it("繰り返しても浮動小数点誤差や範囲外値が蓄積しない", () => {
    let volume = 1;
    const observed: number[] = [];
    for (let i = 0; i < 33; i++) {
      volume = cycleTtsVolume(volume);
      observed.push(volume);
    }
    expect(observed).toEqual(
      Array.from({ length: 3 }, () => [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, 1]).flat(),
    );
  });

  it.each([
    [Number.NaN, 0.9],
    [Number.POSITIVE_INFINITY, 0.9],
    [-1, 1],
    [2, 0.9],
  ])("不正・範囲外値 %s は既存clampに従う", (current, next) => {
    expect(cycleTtsVolume(current)).toBe(next);
  });
});
