/**
 * スマホでの TTS バックグラウンド継続用 (#745 Phase A + perf optimization + Phase D)
 *
 * ## Phase D 変更 (Android 通知欄修正)
 * Android Chrome は HTML `<audio>` / `<video>` 要素が実際に再生されているときのみ
 * 通知トレイに「再生中」コントロールを表示する。
 * - Web Speech API (SpeechSynthesis) → OS は「メディア再生中」と認識しない ❌
 * - Web Audio API Oscillator → OS は「メディア再生中」と認識しない ❌
 * - HTML `<audio>` 要素 → OS が「メディア再生中」と認識して通知表示 ✅
 *
 * 方針:
 * 1. まず HTML `<audio>` 要素 (無音 WAV data URI, loop=true) を試みる [Primary]
 * 2. `<audio>` が使えない環境 (SSR 等) は WebAudio oscillator にフォールバック [Fallback]
 *
 * 無音 WAV: 1 サンプルの最小 WAV ファイル (44 バイト, 無音)。追加 asset / Cache 設定不要。
 *
 * **perf optimization**: AudioContext は `useRef` でコンポーネントライフタイム中 1 つだけ
 * 保持し、active 変化では oscillator start/stop + ctx suspend/resume のみ切り替える。
 */
import { useEffect, useRef } from "react";
import { bgAudioDebug } from "../lib/bgaudio-debug";
import { devError } from "../lib/dev-log";

/**
 * 最小無音 WAV (1 サンプル, 44 バイト)
 * Android Chrome の Media Notification を起動させるには、
 * HTML audio 要素が実際に再生されている必要がある。
 */
const SILENT_AUDIO_URI =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

export function useBackgroundAudio(active: boolean): void {
  // Primary: HTML <audio> 要素 (Android 通知に必須)
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fallback: WebAudio oscillator (HTML audio が使えない環境向け)
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  // Primary: HTML <audio> 要素による無音再生
  useEffect(() => {
    if (typeof window === "undefined") return;
    bgAudioDebug("audio-effect-fired", { active, hasAudio: !!audioRef.current });

    if (!active) {
      if (audioRef.current) {
        audioRef.current.pause();
        bgAudioDebug("audio-paused", {});
      }
      return;
    }

    // active=true: audio 要素を lazy 生成して再生
    if (!audioRef.current) {
      try {
        const audio = new Audio(SILENT_AUDIO_URI);
        audio.loop = true;
        // volume は 1 のまま (muted 属性なし) — OS が「再生中」と認識するために必要
        audioRef.current = audio;
        bgAudioDebug("audio-created", {});
      } catch (err) {
        devError("[useBackgroundAudio] Audio element creation failed", err);
        bgAudioDebug("audio-create-failed", { error: String(err) });
        // フォールバック: WebAudio oscillator へ
      }
    }

    if (audioRef.current) {
      audioRef.current.play().catch((err) => {
        // autoplay policy に引っかかった場合は silent fail
        // (ユーザー操作なしの再生はブロックされることがある)
        devError("[useBackgroundAudio] audio.play() failed", err);
        bgAudioDebug("audio-play-failed", { error: String(err) });
      });
      bgAudioDebug("audio-play-called", {});
    }
  }, [active]);

  // Fallback: WebAudio oscillator (HTML audio が再生できない環境向け)
  useEffect(() => {
    if (typeof window === "undefined") return;
    bgAudioDebug("effect-fired", { active, hasCtx: !!ctxRef.current, hasOsc: !!oscRef.current });

    if (!active) {
      // oscillator を停止して ctx は suspend (close せず保持、次の active=true で resume)
      if (oscRef.current) {
        try {
          oscRef.current.stop();
        } catch {
          // 既に stop 済の InvalidStateError は無視
        }
        oscRef.current = null;
      }
      void ctxRef.current?.suspend().catch((err) => {
        // suspend 失敗は silent fail だが debug ログには出す (#745 Phase C 案 B)
        devError("[useBackgroundAudio] suspend failed", err);
        bgAudioDebug("suspend-failed", { error: String(err) });
      });
      bgAudioDebug("suspended", { ctxState: ctxRef.current?.state });
      return;
    }

    // active=true: 必要なら AudioContext を lazy 生成
    if (!ctxRef.current) {
      const Ctx: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        devError("[useBackgroundAudio] AudioContext API not available");
        bgAudioDebug("ctx-unavailable", {});
        return;
      }
      try {
        ctxRef.current = new Ctx();
        bgAudioDebug("ctx-created", { state: ctxRef.current.state });
      } catch (err) {
        // AudioContext 作成失敗時は silent fail (UX 影響なし)
        devError("[useBackgroundAudio] AudioContext init failed", err);
        bgAudioDebug("ctx-create-failed", { error: String(err) });
        return;
      }
    }

    // suspended なら resume
    void ctxRef.current.resume().catch((err) => {
      // resume 失敗は silent fail (already running 等) だが、iOS Safari の autoplay policy で
      // user activation 不足の場合の唯一の観測点なので debug ログを出す (#745 Phase C 案 B)
      devError("[useBackgroundAudio] resume failed", err);
      bgAudioDebug("resume-failed", { error: String(err), ctxState: ctxRef.current?.state });
    });

    // oscillator が無ければ起動
    if (!oscRef.current) {
      try {
        const osc = ctxRef.current.createOscillator();
        const gain = ctxRef.current.createGain();
        gain.gain.value = 0; // 無音 — UX への音響的影響なし、ブラウザは「再生中」と認識
        osc.connect(gain);
        gain.connect(ctxRef.current.destination);
        osc.start();
        oscRef.current = osc;
        bgAudioDebug("osc-started", { ctxState: ctxRef.current.state });
      } catch (err) {
        // Oscillator 起動失敗時は silent fail
        devError("[useBackgroundAudio] oscillator start failed", err);
        bgAudioDebug("osc-start-failed", { error: String(err) });
      }
    }
  }, [active]);

  // unmount 時に確実に stop + close (oscillator + audio 両方)
  useEffect(() => {
    return () => {
      // audio 要素のクリーンアップ
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // oscillator のクリーンアップ
      if (oscRef.current) {
        try {
          oscRef.current.stop();
        } catch {
          // 既に stop 済の場合の InvalidStateError は無視
        }
        oscRef.current = null;
      }
      if (ctxRef.current) {
        void ctxRef.current.close().catch(() => {
          // close 失敗は silent fail
        });
        ctxRef.current = null;
      }
    };
  }, []);
}
