/**
 * スマホでの TTS バックグラウンド継続用 (#745 Phase A)
 *
 * `speechSynthesis` 単独だとスマホブラウザはバックグラウンドで休眠する。WebAudio API で
 * 無音を再生 (OscillatorNode + GainNode `gain=0`) し続けると、ブラウザは「メディア再生中」
 * と認識して `speechSynthesis` も停止されにくくなる。Media Session API / Wake Lock との
 * 併用は Phase B 以降で導入予定。
 *
 * 無音 mp3 asset を配信する代わりに WebAudio API を使うので、追加 asset / Cache 設定不要。
 *
 * Phase B (次サイクル以降): `useSpeechSynthesis` の speak/stop に連動して `active` を制御。
 */
import { useEffect } from "react";

export function useBackgroundAudio(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    let ctx: AudioContext;
    let osc: OscillatorNode;
    try {
      ctx = new Ctx();
      osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0; // 無音 — UX への音響的影響なし、ブラウザは「再生中」と認識
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
    } catch {
      // AudioContext 作成 / Oscillator 起動失敗時は silent fail (UX 影響なし)
      return;
    }

    return () => {
      try {
        osc.stop();
      } catch {
        // 既に stop 済の場合の InvalidStateError は無視
      }
      void ctx.close();
    };
  }, [active]);
}
