"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  diagnoseTranslatorAvailability,
  type TranslatorUnavailableReason,
} from "../../lib/browser-translator";
import {
  diagnoseSummarizerAvailability,
  type SummarizerUnavailableReason,
} from "../../lib/browser-summarizer";
import { AI_MODELS, type WorkersAiModelId } from "../../lib/ai-models";
import { useToast } from "@/contexts/ToastContext";
import { useDebounce } from "../../hooks/useDebounce";
import { apiFetch } from "@/lib/api-fetch";
import { SettingRow } from "./shared";

interface AiNotificationTabPanelProps {
  hidden: boolean;
  autoTranslate: boolean;
  toggleAutoTranslate: () => void;
  aiModel: WorkersAiModelId;
  onChangeAiModel: (v: WorkersAiModelId) => void;
}

export default function AiNotificationTabPanel({
  hidden,
  autoTranslate,
  toggleAutoTranslate,
  aiModel,
  onChangeAiModel,
}: AiNotificationTabPanelProps) {
  const toast = useToast();

  const [translatorDiag, setTranslatorDiag] = useState<{
    available: boolean;
    reason: TranslatorUnavailableReason;
  } | null>(null);
  const [summarizerDiag, setSummarizerDiag] = useState<{
    available: boolean;
    reason: SummarizerUnavailableReason;
  } | null>(null);

  useEffect(() => {
    diagnoseTranslatorAvailability().then(setTranslatorDiag);
    diagnoseSummarizerAvailability().then(setSummarizerDiag);
  }, []);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [silentStart, setSilentStart] = useState("");
  const [silentEnd, setSilentEnd] = useState("");
  const [timezone, setTimezone] = useState("");
  const [errorNotificationsEnabled, setErrorNotificationsEnabled] = useState(true);
  const [pushConfigLoading, setPushConfigLoading] = useState(false);
  const silentHoursLoaded = useRef(false);
  const timezones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushEnabled(true);
    apiFetch("/api/push/config")
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              silentStart: string | null;
              silentEnd: string | null;
              timezone: string | null;
              errorNotificationsEnabled: boolean;
            }>)
          : null,
      )
      .then((data) => {
        if (!data) return;
        setSilentStart(data.silentStart ?? "");
        setSilentEnd(data.silentEnd ?? "");
        setTimezone(data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
        setErrorNotificationsEnabled(data.errorNotificationsEnabled ?? true);
        // config ロード完了後から自動保存を有効化
        silentHoursLoaded.current = true;
      })
      .catch(() => {});
  }, []);

  const saveSilentHours = useCallback(
    async (start: string, end: string, tz: string) => {
      setPushConfigLoading(true);
      try {
        const body: Record<string, string | null> = {
          silentStart: start || null,
          silentEnd: end || null,
          timezone: tz || null,
        };
        const res = await apiFetch("/api/push/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("サイレント時間帯を保存しました");
        } else {
          toast.error("保存に失敗しました");
        }
      } catch {
        toast.error("保存に失敗しました");
      } finally {
        setPushConfigLoading(false);
      }
    },
    [toast],
  );

  const handleSaveSilentHours = () => saveSilentHours(silentStart, silentEnd, timezone);

  const toggleErrorNotifications = useCallback(async () => {
    const next = !errorNotificationsEnabled;
    setErrorNotificationsEnabled(next);
    try {
      await apiFetch("/api/push/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errorNotificationsEnabled: next }),
      });
    } catch {
      // ロールバック
      setErrorNotificationsEnabled(!next);
      toast.error("保存に失敗しました");
    }
  }, [errorNotificationsEnabled, toast]);

  // サイレント時間帯フィールドの変更を 1000ms デバウンスして自動保存
  const debouncedSilentStart = useDebounce(silentStart, 1000);
  const debouncedSilentEnd = useDebounce(silentEnd, 1000);
  const debouncedTimezone = useDebounce(timezone, 1000);

  useEffect(() => {
    // config ロード完了前（初期空文字列フェーズ）は自動保存しない
    if (!silentHoursLoaded.current) return;
    saveSilentHours(debouncedSilentStart, debouncedSilentEnd, debouncedTimezone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSilentStart, debouncedSilentEnd, debouncedTimezone]);

  return (
    <div
      id="panel-ai-notifications"
      role="tabpanel"
      aria-labelledby="tab-ai-notifications"
      hidden={hidden}
    >
      <div className="flex flex-col gap-5 px-5 py-4">
        <SettingRow label="自動翻訳">
          <button
            type="button"
            role="switch"
            aria-checked={autoTranslate}
            aria-label={autoTranslate ? "自動翻訳を OFF にする" : "自動翻訳を ON にする"}
            onClick={toggleAutoTranslate}
            className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
              autoTranslate ? "bg-ink" : "bg-border-default"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                autoTranslate ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </SettingRow>

        {(translatorDiag || summarizerDiag) && (
          <div className="flex flex-col gap-1.5 pl-28">
            {translatorDiag && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-text-muted">
                  翻訳プロバイダ:{" "}
                  {translatorDiag.available ? (
                    <span className="text-text-default">Chrome 翻訳 &#x2713;</span>
                  ) : (
                    <span className="text-text-default">Workers AI (フォールバック)</span>
                  )}
                </span>
                {!translatorDiag.available && translatorDiag.reason && (
                  <span className="text-[10px] text-text-faint">
                    {translatorDiag.reason === "not-chromium" &&
                      "Chrome/Edge 以外のブラウザでは Chrome 翻訳を利用できません"}
                    {translatorDiag.reason === "chrome-too-old" &&
                      "Chrome Translator API は Chrome 131 以上が必要です。Chrome をアップデートしてください"}
                    {translatorDiag.reason === "flag-disabled" &&
                      "chrome://flags/#translation-api を Enabled にして Chrome を再起動してください（Chrome 138 以上では不要）"}
                    {translatorDiag.reason === "not-available" &&
                      "言語パックが利用できません。Chrome の設定から言語を追加してください"}
                  </span>
                )}
              </div>
            )}
            {summarizerDiag && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-text-muted">
                  要約プロバイダ:{" "}
                  {summarizerDiag.available ? (
                    <span className="text-text-default">Chrome 要約 &#x2713;</span>
                  ) : (
                    <span className="text-text-default">Workers AI (フォールバック)</span>
                  )}
                </span>
                {!summarizerDiag.available && summarizerDiag.reason && (
                  <span className="text-[10px] text-text-faint">
                    {summarizerDiag.reason === "not-chromium" &&
                      "Chrome/Edge 以外のブラウザでは Chrome 要約を利用できません"}
                    {summarizerDiag.reason === "chrome-too-old" &&
                      "Chrome Summarizer API は Chrome 131 以上が必要です。Chrome をアップデートしてください"}
                    {summarizerDiag.reason === "flag-disabled" &&
                      "chrome://flags/#summarization-api-for-gemini-nano を Enabled にして Chrome を再起動してください（Chrome 138 以上では chrome://flags/#optimization-guide-on-device-model も Enabled にしてください）"}
                    {summarizerDiag.reason === "model-downloading" &&
                      "要約モデルをダウンロード中です。しばらくお待ちください（chrome://settings/aiPage でダウンロード状況を確認できます）"}
                    {summarizerDiag.reason === "model-unavailable" &&
                      "要約モデルをデバイスで利用できません。ハードウェア要件（GPU・ストレージ・OS バージョン）を確認してください。詳細は chrome://on-device-internals で確認できます"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <SettingRow label="Workers AI モデル">
          <select
            value={aiModel}
            onChange={(e) => onChangeAiModel(e.target.value as WorkersAiModelId)}
            className="text-[13px] bg-surface-subtle border border-border-default rounded-md px-2 py-1 text-text-default focus:outline-none focus:ring-1 focus:ring-text-muted"
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <div className="flex flex-col gap-1 pl-28">
          <span className="text-[11px] text-text-muted">
            AI 要約・翻訳で使用する Workers AI モデルを選択します。70B は高精度ですが 1 分間 3
            回の制限があります。
          </span>
        </div>

        {pushEnabled && (
          <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
            <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
              Push 通知設定
            </span>
            <SettingRow label="フィードエラー通知">
              <button
                type="button"
                role="switch"
                aria-checked={errorNotificationsEnabled}
                aria-label={
                  errorNotificationsEnabled
                    ? "フィードエラー通知を OFF にする"
                    : "フィードエラー通知を ON にする"
                }
                onClick={toggleErrorNotifications}
                className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
                  errorNotificationsEnabled ? "bg-ink" : "bg-border-default"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                    errorNotificationsEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </SettingRow>
            <div className="flex flex-col gap-1 pl-28">
              <span className="text-[11px] text-text-muted">
                5回連続でフィードの取得に失敗したときに Push 通知で知らせます。
              </span>
            </div>
            <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted pt-2">
              Push 通知サイレント時間帯
            </span>
            <SettingRow label="開始時刻">
              <input
                type="time"
                value={silentStart}
                onChange={(e) => setSilentStart(e.target.value)}
                className="px-2 py-1 text-[13px] rounded-md border border-border-default bg-surface-elevated text-text-default focus:outline-none focus:border-ink transition-colors"
              />
            </SettingRow>
            <SettingRow label="終了時刻">
              <input
                type="time"
                value={silentEnd}
                onChange={(e) => setSilentEnd(e.target.value)}
                className="px-2 py-1 text-[13px] rounded-md border border-border-default bg-surface-elevated text-text-default focus:outline-none focus:border-ink transition-colors"
              />
            </SettingRow>
            {timezones.length > 0 && (
              <SettingRow label="タイムゾーン">
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="text-[13px] bg-surface-subtle border border-border-default rounded-md px-2 py-1 text-text-default focus:outline-none focus:ring-1 focus:ring-text-muted"
                >
                  <option value="">未設定</option>
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </SettingRow>
            )}
            <div className="pl-28">
              <button
                type="button"
                disabled={pushConfigLoading}
                onClick={handleSaveSilentHours}
                className="px-3 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                保存
              </button>
            </div>
            <div className="flex flex-col gap-1 pl-28">
              <span className="text-[11px] text-text-muted">
                設定した時間帯は Push 通知を送信しません。開始・終了どちらかが空の場合は無効です。
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
