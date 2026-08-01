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
import { apiFetch } from "../../lib/api-fetch";
import { devError } from "../../lib/dev-log";
import { SettingRow, ToggleSwitch } from "./shared";

// Intl.supportedValuesOf("timeZone") はセッション不変な ~440 件の timezone 配列を返す。
// component body で呼ぶと keystroke / debounce 起点の re-render ごとに ICU list の再構築 +
// 440 <option> の new-identity reconciliation が走るため module-level constant に集約する。
const TIMEZONES: readonly string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

interface AiNotificationTabPanelProps {
  hidden: boolean;
  autoTranslate: boolean;
  toggleAutoTranslate: () => void;
  autoSummarize: boolean;
  toggleAutoSummarize: () => void;
  /** #700: ON でブラウザ AI 不可なら auto-translate / auto-summarize skip (Workers AI フォールバック防止) */
  autoAiBrowserOnly: boolean;
  toggleAutoAiBrowserOnly: () => void;
  aiModel: WorkersAiModelId;
  onChangeAiModel: (v: WorkersAiModelId) => void;
}

export default function AiNotificationTabPanel({
  hidden,
  autoTranslate,
  toggleAutoTranslate,
  autoSummarize,
  toggleAutoSummarize,
  autoAiBrowserOnly,
  toggleAutoAiBrowserOnly,
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
      .catch((err) => {
        devError("[AiNotificationTabPanel] push config fetch failed", err);
      });
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
      } catch (err) {
        devError("[AiNotificationTabPanel] push config PUT (silent hours) failed", err);
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
    } catch (err) {
      // ロールバック
      devError("[AiNotificationTabPanel] push config PUT (errorNotifications) failed", err);
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
          <ToggleSwitch
            checked={autoTranslate}
            onChange={() => toggleAutoTranslate()}
            ariaLabel={autoTranslate ? "自動翻訳を OFF にする" : "自動翻訳を ON にする"}
          />
        </SettingRow>

        <SettingRow label="自動要約">
          <ToggleSwitch
            checked={autoSummarize}
            onChange={() => toggleAutoSummarize()}
            ariaLabel={autoSummarize ? "自動要約を OFF にする" : "自動要約を ON にする"}
          />
        </SettingRow>

        <SettingRow label="ブラウザ AI のみ使う">
          <ToggleSwitch
            checked={autoAiBrowserOnly}
            onChange={() => toggleAutoAiBrowserOnly()}
            ariaLabel={
              autoAiBrowserOnly
                ? "ブラウザ AI のみ使う設定を OFF にする"
                : "ブラウザ AI のみ使う設定を ON にする"
            }
          />
        </SettingRow>
        <p className="text-[11px] text-text-muted pl-28 -mt-2">
          ON のとき、ブラウザネイティブ AI (Chrome 翻訳・要約)
          が使えない記事では自動翻訳・自動要約を行わず Workers AI
          へのフォールバックを防ぎますわ。手動の AI / 翻訳ボタンは影響を受けません。
        </p>

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
                      "ご利用のブラウザでは端末上の翻訳が使えないため、サーバー側 (Workers AI) で翻訳します"}
                    {translatorDiag.reason === "chrome-too-old" &&
                      "Chrome のバージョンが古いため、サーバー側で翻訳します（Chrome 138 以上にアップデートすると端末上で翻訳できます）"}
                    {translatorDiag.reason === "flag-disabled" &&
                      "Chrome 翻訳はオプトインが必要なため、サーバー側で翻訳します（Chrome 138 未満では chrome://flags/#translation-api を有効化してください）"}
                    {translatorDiag.reason === "not-available" &&
                      "言語パックが未インストールのため、サーバー側で翻訳します（Chrome の設定から言語を追加すると端末上で翻訳できます）"}
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
                      "ご利用のブラウザでは端末上の要約が使えないため、サーバー側 (Workers AI) で要約します"}
                    {summarizerDiag.reason === "chrome-too-old" &&
                      "Chrome のバージョンが古いため、サーバー側で要約します（Chrome 138 以上にアップデートすると端末上で要約できます）"}
                    {summarizerDiag.reason === "flag-disabled" &&
                      "Chrome 要約 API が無効化されています。chrome://flags/#summarization-api-for-gemini-nano を Enabled にして再起動してください。chrome://on-device-internals でモデル DL 状況も確認できます"}
                    {summarizerDiag.reason === "model-downloading" &&
                      "Chrome がモデル (約 22GB) をダウンロード中です。完了までサーバー側で要約します。chrome://on-device-internals で進捗を確認できます"}
                    {summarizerDiag.reason === "requires-user-activation" &&
                      "Chrome 要約 API は初回ダウンロード時にユーザー操作が必要です。AI 要約ボタンを再度クリックしてください"}
                    {summarizerDiag.reason === "model-unavailable" &&
                      "ご利用環境では端末上の要約が使えないため、サーバー側 (Workers AI) で要約します（要件: Chrome 138+ / 22GB 空き / GPU 4GB VRAM か CPU 16GB RAM 4 コア）"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <SettingRow label="Workers AI モデル">
          <select
            aria-label="Workers AI モデル"
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
              <ToggleSwitch
                checked={errorNotificationsEnabled}
                onChange={() => toggleErrorNotifications()}
                ariaLabel={
                  errorNotificationsEnabled
                    ? "フィードエラー通知を OFF にする"
                    : "フィードエラー通知を ON にする"
                }
              />
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
                aria-label="サイレント時間帯 開始時刻"
                value={silentStart}
                onChange={(e) => setSilentStart(e.target.value)}
                className="px-2 py-1 text-[13px] rounded-md border border-border-default bg-surface-elevated text-text-default focus:outline-none focus:border-ink transition-colors"
              />
            </SettingRow>
            <SettingRow label="終了時刻">
              <input
                type="time"
                aria-label="サイレント時間帯 終了時刻"
                value={silentEnd}
                onChange={(e) => setSilentEnd(e.target.value)}
                className="px-2 py-1 text-[13px] rounded-md border border-border-default bg-surface-elevated text-text-default focus:outline-none focus:border-ink transition-colors"
              />
            </SettingRow>
            {TIMEZONES.length > 0 && (
              <SettingRow label="タイムゾーン">
                <select
                  aria-label="サイレント時間帯 タイムゾーン"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="text-[13px] bg-surface-subtle border border-border-default rounded-md px-2 py-1 text-text-default focus:outline-none focus:ring-1 focus:ring-text-muted"
                >
                  <option value="">未設定</option>
                  {TIMEZONES.map((tz) => (
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
