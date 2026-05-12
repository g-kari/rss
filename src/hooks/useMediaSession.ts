/**
 * MediaSession API 配線 hook (#745 Phase C 案 A)。
 *
 * `navigator.mediaSession.metadata` + `setActionHandler("play"/"pause"/"stop")` を TTS adapter
 * に配線して、iOS Safari ロック画面 / Android 通知センターに **記事タイトル + play/pause/stop
 * コントロール** を表示する。speechSynthesis が OS 観点で「メディア再生中」と認識されて
 * バックグラウンド休眠を回避できる canonical solution。
 *
 * defense in depth:
 * - `useBackgroundAudio` (無音 oscillator) は引き続き併用 (WebAudio 仕様で「メディア再生中」認識)
 * - 本 hook は OS-level の MediaSession で **更に堅牢化** (lockscreen / Bluetooth ヘッドセット連動)
 *
 * 設計:
 * - TTS 再生中 (isPlaying || isPaused) は metadata + handler を設定
 * - 再生停止 (isPlaying === false && isPaused === false) で `playbackState = "none"` + handler 解除
 * - 再生中 / 一時停止 で `playbackState` を切替 (lockscreen UI に反映)
 * - SSR / 未対応環境 (`navigator.mediaSession` 不在) は silent skip
 */
import { useEffect } from "react";
import type { Article } from "../types";
import type { TtsAdapter } from "../lib/tts-adapter";
import { devError } from "../lib/dev-log";

interface UseMediaSessionOptions {
  article: Article | null | undefined;
  ttsAdapter: TtsAdapter;
}

export function useMediaSession({ article, ttsAdapter }: UseMediaSessionOptions): void {
  const isActive = ttsAdapter.isPlaying || ttsAdapter.isPaused;
  const title = article?.title ?? "";
  const author = article?.author ?? "";

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ms = navigator.mediaSession;
    if (!ms) return; // 未対応環境 (Web View 等) は silent skip

    if (!isActive) {
      // TTS 停止状態: metadata / handler をクリアして OS lockscreen UI を消す
      try {
        ms.metadata = null;
        ms.playbackState = "none";
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("stop", null);
      } catch (err) {
        devError("[useMediaSession] clear failed", err);
      }
      return;
    }

    // TTS 再生中 / 一時停止中: metadata + handler を設定
    try {
      ms.metadata = new MediaMetadata({
        title: title || "(タイトルなし)",
        artist: author || "RSS Reader",
      });
      ms.playbackState = ttsAdapter.isPaused ? "paused" : "playing";

      ms.setActionHandler("play", () => {
        if (ttsAdapter.isPaused) {
          ttsAdapter.resume();
        }
      });
      ms.setActionHandler("pause", () => {
        if (ttsAdapter.isPlaying && !ttsAdapter.isPaused) {
          ttsAdapter.pause();
        }
      });
      ms.setActionHandler("stop", () => {
        ttsAdapter.stop();
      });
    } catch (err) {
      devError("[useMediaSession] set failed", err);
    }
  }, [isActive, title, author, ttsAdapter]);

  // unmount 時に metadata / handler をクリア
  useEffect(() => {
    return () => {
      if (typeof navigator === "undefined") return;
      const ms = navigator.mediaSession;
      if (!ms) return;
      try {
        ms.metadata = null;
        ms.playbackState = "none";
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("stop", null);
      } catch {
        /* silent */
      }
    };
  }, []);
}
