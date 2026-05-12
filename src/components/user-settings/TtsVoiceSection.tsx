"use client";

import { useMemo } from "react";
import { useTtsAdapter } from "../../contexts/TtsAdapterContext";
import { groupVoicesByLang } from "../../lib/tts-voice";

/**
 * UserSettingsModal の表示タブに表示する「読み上げ音声」セクション (#675 Phase 1b)。
 *
 * 記事ヘッダーから移動した voice 選択 UI + 現在の TTS engine 表示を提供する。
 * `useTtsAdapter()` で App.tsx に注入された TtsAdapter を購読するため、prop drilling 不要。
 *
 * Phase 2 (#674) で Piper wasm adapter が追加されたら、engine 切替 UI もここに増やす予定。
 */
export default function TtsVoiceSection() {
  const {
    engine,
    supported,
    voices,
    voiceUri,
    setVoiceUri,
    volume,
    setVolume,
    setEngine,
    availableEngines,
  } = useTtsAdapter();
  // 記事言語ヒント (document.documentElement.lang) で voice 並び順を最適化
  const docLang = typeof document !== "undefined" ? document.documentElement.lang || null : null;
  const voiceGroups = useMemo(() => groupVoicesByLang(voices, docLang), [voices, docLang]);

  // engine 切替 UI は #674 Phase 2b で App.tsx が `setEngine` を注入したときのみ表示
  const canSwitchEngine = setEngine !== undefined && (availableEngines?.length ?? 0) > 1;

  if (!supported) {
    return (
      <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          読み上げ音声
        </span>
        <span className="text-[12px] text-text-muted">
          {engine === "piper"
            ? "Piper wasm engine は OPFS 非対応ブラウザでは利用できませんわ。"
            : "このブラウザは Web Speech API に対応していないため、読み上げ機能は利用できませんわ。"}
        </span>
        {canSwitchEngine && setEngine && (
          <button
            type="button"
            onClick={() => setEngine(engine === "piper" ? "web-speech" : "piper")}
            className="self-start text-[12px] bg-surface-elevated border border-border-default rounded px-3 py-1.5 text-text-default hover:border-text-muted transition-colors"
          >
            {engine === "piper" ? "ブラウザ標準に切替" : "Piper に切替"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
      <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
        読み上げ音声
      </span>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tts-engine-select" className="text-[12px] font-medium text-text-default">
          エンジン
        </label>
        {canSwitchEngine && setEngine ? (
          <select
            id="tts-engine-select"
            value={engine}
            onChange={(e) => setEngine(e.target.value as "web-speech" | "piper")}
            className="text-[12px] bg-surface-elevated border border-border-default rounded px-2 py-1.5 text-text-default hover:border-text-muted focus:outline-none focus:border-text-strong transition-colors duration-200"
          >
            <option value="web-speech">ブラウザ標準 (Web Speech API)</option>
            <option value="piper">Piper (wasm: 自然な日本語読み上げ / モデル DL 要)</option>
          </select>
        ) : (
          <span className="text-[12px] text-text-soft">
            {engine === "web-speech" ? "ブラウザ標準 (Web Speech API)" : engine}
          </span>
        )}
        {engine === "piper" && (
          <span className="text-[11px] text-text-muted">
            初回再生時にモデル (数十 MB) がブラウザ OPFS に DL されますわ。つくよみちゃん等の voice
            は公式 huggingface から自動取得されます。
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tts-voice-select" className="text-[12px] font-medium text-text-default">
          ボイス
        </label>
        <select
          id="tts-voice-select"
          value={voiceUri ?? ""}
          onChange={(e) => setVoiceUri(e.target.value || null)}
          className="text-[12px] bg-surface-elevated border border-border-default rounded px-2 py-1.5 text-text-default hover:border-text-muted focus:outline-none focus:border-text-strong transition-colors duration-200"
        >
          <option value="">自動 (記事の言語に合わせて選択)</option>
          {voiceGroups.map((group) => (
            <optgroup key={group.lang} label={group.lang.toUpperCase()}>
              {group.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="text-[11px] text-text-muted">
          記事ヘッダーの ▶︎
          ボタンで使用するボイスです。「自動」を選ぶと記事の言語に合わせて選択しますわ。
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tts-volume-slider" className="text-[12px] font-medium text-text-default">
          音量 <span className="text-text-muted tabular-nums">({Math.round(volume * 100)}%)</span>
        </label>
        <input
          id="tts-volume-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(parseInt(e.target.value, 10) / 100)}
          className="w-full accent-ink"
        />
        <span className="text-[11px] text-text-muted">
          0% でミュート、100%
          でブラウザ既定の最大音量ですわ。再生中に変更すると新しい音量で再生し直しますわ。
        </span>
      </div>
    </div>
  );
}
