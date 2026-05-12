/**
 * スマホでの TTS バックグラウンド継続用 (#745 Phase A + perf optimization)
 *
 * `speechSynthesis` 単独だとスマホブラウザはバックグラウンドで休眠する。WebAudio API で
 * 無音を再生 (OscillatorNode + GainNode `gain=0`) し続けると、ブラウザは「メディア再生中」
 * と認識して `speechSynthesis` も停止されにくくなる。
 *
 * **perf optimization**: AudioContext は `useRef` でコンポーネントライフタイム中 1 つだけ
 * 保持し、active 変化では oscillator start/stop + ctx suspend/resume のみ切り替える
 * (新規生成 / close はしない)。これで TTS 再生のたびに OS audio session 切替コスト
 * (数十 ms) を発生させず、Chrome の同時 AudioContext 数上限 (6 個) にも抵触しない。
 *
 * 無音 mp3 asset を配信する代わりに WebAudio API を使うので、追加 asset / Cache 設定不要。
 */
import { useEffect, useRef } from "react";
import { bgAudioDebug } from "../lib/bgaudio-debug";
import { devError } from "../lib/dev-log";

export function useBackgroundAudio(active: boolean): void {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

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

  // unmount 時に確実に stop + close
  useEffect(() => {
    return () => {
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
