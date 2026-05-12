"use client";

import { useTtsAdapter } from "../contexts/TtsAdapterContext";

/**
 * Piper TTS engine 初期化中の進捗を右下に floating 表示するコンポーネント (#761)。
 *
 * `useTtsAdapter().initProgress` が non-null のときだけ描画。Web Speech engine では
 * 常に null で何も表示されない (初期化即時完了)。Piper engine では library load /
 * WASM DL / model DL / ONNX session 作成の各段階で更新される。
 *
 * UX 設計:
 * - 右下に固定位置 (`fixed bottom-4 right-4`)
 * - ToastContainer (`bottom-4 right-4` 想定) と被らないよう少し上にオフセット
 * - progress bar (0-100%) + stage 名 + メッセージ
 * - 完了で `usePiperTts.ts` 側が 1.5 秒後 null に → 自動消去
 * - 失敗で `usePiperTts.ts` 側が即時 null に → 自動消去 (error は別 toast で通知)
 */
export default function PiperInitProgressToast() {
  const { initProgress } = useTtsAdapter();

  if (!initProgress) return null;

  const pct = Math.max(0, Math.min(100, Math.round(initProgress.progress * 100)));
  const isComplete = initProgress.stage === "complete";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 right-4 z-50 max-w-sm w-80 bg-surface-elevated border border-border-default rounded-lg shadow-lg p-4 flex flex-col gap-2"
    >
      <div className="flex items-start gap-2">
        <span className="text-[12px] font-medium text-text-strong shrink-0">
          {isComplete ? "✓ Piper 準備完了" : "Piper 初期化中"}
        </span>
        <span className="text-[11px] text-text-muted tabular-nums ml-auto shrink-0">{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-surface-subtle rounded-full overflow-hidden">
        <div
          className="h-full bg-ink transition-all duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-text-soft leading-relaxed">
        <span className="text-text-muted">{initProgress.stage}:</span> {initProgress.message}
      </p>
    </div>
  );
}
