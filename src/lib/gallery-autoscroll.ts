/**
 * ギャラリービューの自動スクロール純粋関数 (#690 案 D)。
 *
 * 4 段階の速度設定:
 *   - "off": 自動スクロール無効
 *   - "slow" / "medium" / "fast": `requestAnimationFrame` 連続スクロール (px/sec)
 *   - "slideshow": `setInterval` ベースで N 秒ごとに 1 viewport 分ジャンプ
 *
 * 「速度設定の最高速をスライドショー化」というハイブリッド設計により、
 * 1 つの設定スライダーで「ゆっくり眺める」〜「写真鑑賞スライドショー」の
 * 連続的な利用シーンに対応する。
 *
 * `useGalleryAutoScroll` hook 側で本ファイルの定数 + 純粋関数を組み合わせて
 * scroll 副作用を発火させる。
 */

export type GalleryAutoScrollSpeed = "off" | "slow" | "medium" | "fast" | "slideshow";

export const GALLERY_AUTO_SCROLL_SPEEDS: readonly GalleryAutoScrollSpeed[] = [
  "off",
  "slow",
  "medium",
  "fast",
  "slideshow",
] as const;

/**
 * 速度設定 → 連続スクロール時の px/秒。
 * "off" / "slideshow" は 0 (連続スクロール非該当)。
 */
const PX_PER_SEC: Record<GalleryAutoScrollSpeed, number> = {
  off: 0,
  slow: 30,
  medium: 60,
  fast: 120,
  slideshow: 0,
};

/** スライドショーモードのジャンプ間隔 (ms)。N 秒ごとに 1 viewport 分スクロール。 */
export const SLIDESHOW_INTERVAL_MS = 3000;

/** スライドショーモードの 1 ジャンプあたり viewport 高さに対する係数。 */
export const SLIDESHOW_JUMP_RATIO = 0.85;

/**
 * 連続スクロール speed のとき、経過時間 (ms) から進めるべき px を返す。
 *
 * @example
 *   computeContinuousScrollDelta("slow", 1000) // → 30 (1 秒で 30px)
 *   computeContinuousScrollDelta("fast", 100)  // → 12 (100ms で 12px)
 *   computeContinuousScrollDelta("slideshow", 100) // → 0 (slideshow は別経路)
 *   computeContinuousScrollDelta("off", 100)   // → 0
 */
export function computeContinuousScrollDelta(
  speed: GalleryAutoScrollSpeed,
  elapsedMs: number,
): number {
  if (elapsedMs <= 0) return 0;
  const pxPerSec = PX_PER_SEC[speed];
  if (pxPerSec === 0) return 0;
  return (pxPerSec * elapsedMs) / 1000;
}

/**
 * speed が連続スクロール (rAF) モードかを返す。
 * "slideshow" は別経路 (setInterval) で動かすため false。
 */
export function isContinuousScrollMode(speed: GalleryAutoScrollSpeed): boolean {
  return PX_PER_SEC[speed] > 0;
}

/**
 * speed がスライドショーモードかを返す。
 */
export function isSlideshowMode(speed: GalleryAutoScrollSpeed): boolean {
  return speed === "slideshow";
}

/**
 * speed が自動スクロール有効 (連続 or スライドショー) かを返す。
 */
export function isAutoScrollEnabled(speed: GalleryAutoScrollSpeed): boolean {
  return speed !== "off";
}

/**
 * スライドショーモードで 1 ジャンプあたり進める px を返す。
 *
 * viewport 高さの SLIDESHOW_JUMP_RATIO 倍をスクロール (画面下部のサムネを完全に見切らないよう
 * 0.85 で少し残す)。
 */
export function computeSlideshowJump(viewportHeight: number): number {
  if (viewportHeight <= 0) return 0;
  return viewportHeight * SLIDESHOW_JUMP_RATIO;
}

/**
 * localStorage から復元した文字列を `GalleryAutoScrollSpeed` に正規化する。
 * 不正値は "off" にフォールバック (既存挙動 = OFF を維持)。
 */
export function parseGalleryAutoScrollSpeed(
  stored: string | null | undefined,
): GalleryAutoScrollSpeed {
  if (!stored) return "off";
  if ((GALLERY_AUTO_SCROLL_SPEEDS as readonly string[]).includes(stored)) {
    return stored as GalleryAutoScrollSpeed;
  }
  return "off";
}
