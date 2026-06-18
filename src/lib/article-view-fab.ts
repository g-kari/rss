/**
 * 記事詳細本文「先頭へ戻る」FAB の表示判定純粋関数 (#1149)。
 *
 * 条件:
 * - progress > 30: 短記事 (5000 文字未満等で進捗 30% 未満) では非表示
 * - !ttsPlaying && !ttsPaused: TTS 再生中 (or pause) は意図しない scrollTop reset で
 *   読み上げ位置喪失リスクを避けるため非表示 (Issue #1149 案 C)
 *
 * canonical: `ImageGallery.tsx:144-160` の 44px round FAB button pattern を流用予定。
 */
export function shouldShowBackToTopFab(
  progress: number,
  ttsPlaying: boolean,
  ttsPaused: boolean,
): boolean {
  return progress > 30 && !ttsPlaying && !ttsPaused;
}
