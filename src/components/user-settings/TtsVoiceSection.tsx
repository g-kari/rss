"use client";

import { useMemo } from "react";
import { useTtsAdapter } from "../../contexts/TtsAdapterContext";
import { groupVoicesByLang } from "../../lib/tts-voice";
import { findPiperPlusVoice, PIPER_PLUS_VOICES } from "../../lib/piper-voices";

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

  // engine 切替 UI は availableEngines が 2 つ以上で setEngine が注入された場合のみ表示。
  // Phase 2b では availableEngines = ["web-speech"] のみ (Piper は Phase 2c で復活予定)。
  const canSwitchEngine = setEngine !== undefined && (availableEngines?.length ?? 0) > 1;

  // 選択中 voice (Piper engine の場合) の credit 情報。non-Piper voice や未選択時は null。
  // engine="piper" のとき、voice 未選択 (自動) でも tsukuyomi credit を必ず表示する
  // (公式規約「目立つ場所に十分な文字サイズで掲載」を満たすため、Piper 使用者全員に告知)。
  const piperCreditVoice = useMemo(() => {
    if (engine !== "piper") return null;
    const selected = findPiperPlusVoice(voiceUri);
    if (selected?.credit) return selected;
    // 未選択時は credit を持つ最初の voice (tsukuyomi 等) を fallback として表示
    return PIPER_PLUS_VOICES.find((v) => v.credit) ?? null;
  }, [engine, voiceUri]);

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
        {canSwitchEngine && setEngine ? (
          <>
            <label
              htmlFor="tts-engine-select"
              className="text-[12px] font-medium text-text-default"
            >
              エンジン
            </label>
            <select
              id="tts-engine-select"
              value={engine}
              onChange={(e) => setEngine(e.target.value as "web-speech" | "piper")}
              className="text-[12px] bg-surface-elevated border border-border-default rounded px-2 py-1.5 text-text-default hover:border-text-muted focus:outline-none focus:border-text-strong transition-colors duration-200"
            >
              <option value="web-speech">ブラウザ標準 (Web Speech API)</option>
              <option value="piper">Piper (wasm: 自然な日本語読み上げ / モデル DL 要)</option>
            </select>
          </>
        ) : (
          <>
            {/* 単一 engine のみのため <select> 非レンダー、label htmlFor の dangling reference
                回避のため <label> でなく <span> でラベル表示 (WCAG 1.3.1 Info and Relationships)。 */}
            <span className="text-[12px] font-medium text-text-default">エンジン</span>
            <span className="text-[12px] text-text-soft">
              {engine === "web-speech" ? "ブラウザ標準 (Web Speech API)" : engine}
            </span>
          </>
        )}
        {engine === "piper" && (
          <span className="text-[11px] text-text-muted">
            初回再生時にモデル (数十 MB) がブラウザにキャッシュされますわ。
          </span>
        )}
      </div>

      {/* Piper voice のクレジット表記 (つくよみちゃんコーパス利用規約に基づく必須掲載) */}
      {piperCreditVoice?.credit && (
        <div className="border border-border-default rounded p-3 bg-surface-elevated flex flex-col gap-2">
          <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
            音声素材クレジット
          </span>
          <p className="text-[13px] text-text-default whitespace-pre-line leading-relaxed">
            {piperCreditVoice.credit.creditText}
          </p>
          <a
            href={piperCreditVoice.credit.creditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-text-default underline hover:text-text-strong break-all"
          >
            {piperCreditVoice.credit.creditUrl}
          </a>
          <div className="flex flex-col gap-1 pt-1 border-t border-border-subtle">
            <span className="text-[11px] font-medium text-text-default">
              ライセンス: {piperCreditVoice.credit.license}
            </span>
            {piperCreditVoice.credit.restrictions.length > 0 && (
              <>
                <span className="text-[11px] text-text-muted">
                  出力音声を以下の用途に使用することは禁止されておりますわ:
                </span>
                <ul className="text-[11px] text-text-muted list-disc list-inside pl-1 flex flex-col gap-0.5">
                  {piperCreditVoice.credit.restrictions.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

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
