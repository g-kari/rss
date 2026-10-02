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
import { isAiProviderPreference, type AiProviderPreference } from "../../lib/ai-preferences";
import { AI_MODELS, type WorkersAiModelId } from "../../lib/ai-models";
import { useToast } from "@/contexts/ToastContext";
import { useDebounce } from "../../hooks/useDebounce";
import { apiFetch } from "../../lib/api-fetch";
import { devError } from "../../lib/dev-log";
import RecommendationNotificationSettings from "./RecommendationNotificationSettings";
import type { RecommendationPushSettings } from "../../hooks/useRecommendationPushSettings";
import SettingsCategoryPanel from "./SettingsCategoryPanel";
import type { SettingsCategoryId } from "./settings-catalog";
import { SettingRow, ToggleSwitch } from "./shared";

// Intl.supportedValuesOf("timeZone") はセッション不変な ~440 件の timezone 配列を返す。
// component body で呼ぶと keystroke / debounce 起点の re-render ごとに ICU list の
// 再構築 + `.map` closure allocation が走るため module-level constant に集約する
// (<option> 子要素の reconciliation は `key={tz}` 駆動なのでこの hoist では変わらない)。
// `Object.freeze` は canonical `empty-sentinels.ts` sentinel 3 件と同じ runtime safety net
// (`react-state-ref.md § 派生「モジュールレベル sentinel オブジェクト」`)。
const TIMEZONES: readonly string[] = Object.freeze(
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [],
);

// React elements は immutable props object のため module-level 再利用が安全。
// UserSettingsModal は useReaderSettings Context を subscribe しており、
// `galleryMinImagePx` <input type="range"> スライダードラッグの秒間数十回 onChange で
// 4 tab panel 全てが re-render するため、hidden tab 内で 440 React 要素を毎 render
// allocate すると reconciliation コストが累積する。module-level hoist で 1 回生成に集約。
const TIMEZONE_OPTIONS = TIMEZONES.map((tz) => (
  <option key={tz} value={tz}>
    {tz}
  </option>
));

interface AiNotificationTabPanelProps {
  userId: string;
  hidden: boolean;
  activeCategory?: SettingsCategoryId;
  autoTranslate: boolean;
  toggleAutoTranslate: () => void;
  autoSummarize: boolean;
  toggleAutoSummarize: () => void;
  /** #700: ON でブラウザ AI 不可なら auto-translate / auto-summarize skip (Workers AI フォールバック防止) */
  autoAiBrowserOnly: boolean;
  toggleAutoAiBrowserOnly: () => void;
  aiProvider: AiProviderPreference;
  onChangeAiProvider: (v: AiProviderPreference) => void;
  aiModel: WorkersAiModelId;
  onChangeAiModel: (v: WorkersAiModelId) => void;
}

export default function AiNotificationTabPanel({
  userId,
  hidden,
  activeCategory,
  autoTranslate,
  toggleAutoTranslate,
  autoSummarize,
  toggleAutoSummarize,
  autoAiBrowserOnly,
  toggleAutoAiBrowserOnly,
  aiProvider,
  onChangeAiProvider,
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
    if (hidden || activeCategory === "notifications" || aiProvider === "workers-ai") return;
    let cancelled = false;
    diagnoseTranslatorAvailability().then((value) => {
      if (!cancelled) setTranslatorDiag(value);
    });
    diagnoseSummarizerAvailability().then((value) => {
      if (!cancelled) setSummarizerDiag(value);
    });
    return () => {
      cancelled = true;
    };
  }, [hidden, activeCategory, aiProvider]);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [silentStart, setSilentStart] = useState("");
  const [silentEnd, setSilentEnd] = useState("");
  const [timezone, setTimezone] = useState("");
  const [errorNotificationsEnabled, setErrorNotificationsEnabled] = useState(true);
  const [pushConfigLoading, setPushConfigLoading] = useState(false);
  const silentHoursLoaded = useRef(false);
  const savedSilentHours = useRef("");
  const [recommendationConfig, setRecommendationConfig] =
    useState<RecommendationPushSettings | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const controller = new AbortController();
    silentHoursLoaded.current = false;
    setRecommendationConfig(null);
    setPushEnabled(true);
    apiFetch("/api/push/config", {
      signal: controller.signal,
      headers: { "X-RSS-Account-Id": userId },
    })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              silentStart: string | null;
              silentEnd: string | null;
              timezone: string | null;
              errorNotificationsEnabled: boolean;
              recommendationEnabled?: boolean;
              recommendationTime?: string;
            }>)
          : null,
      )
      .then((data) => {
        if (!data || controller.signal.aborted) return;
        setSilentStart(data.silentStart ?? "");
        setSilentEnd(data.silentEnd ?? "");
        setTimezone(data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
        setErrorNotificationsEnabled(data.errorNotificationsEnabled ?? true);
        setRecommendationConfig({
          recommendationEnabled: data.recommendationEnabled === true,
          recommendationTime: data.recommendationTime ?? "09:00",
        });
        savedSilentHours.current = JSON.stringify([
          data.silentStart ?? "",
          data.silentEnd ?? "",
          data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
        ]);
        // config ロード完了後から自動保存を有効化
        silentHoursLoaded.current = true;
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          devError("[AiNotificationTabPanel] push config fetch failed", err);
      });
    return () => controller.abort();
  }, [userId]);

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
          headers: { "Content-Type": "application/json", "X-RSS-Account-Id": userId },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          savedSilentHours.current = JSON.stringify([start, end, tz]);
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
    [toast, userId],
  );

  const handleSaveSilentHours = () => saveSilentHours(silentStart, silentEnd, timezone);

  const toggleErrorNotifications = useCallback(async () => {
    const next = !errorNotificationsEnabled;
    setErrorNotificationsEnabled(next);
    try {
      await apiFetch("/api/push/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-RSS-Account-Id": userId },
        body: JSON.stringify({ errorNotificationsEnabled: next }),
      });
    } catch (err) {
      // ロールバック
      devError("[AiNotificationTabPanel] push config PUT (errorNotifications) failed", err);
      setErrorNotificationsEnabled(!next);
      toast.error("保存に失敗しました");
    }
  }, [errorNotificationsEnabled, toast, userId]);

  // サイレント時間帯フィールドの変更を 1000ms デバウンスして自動保存
  const debouncedSilentStart = useDebounce(silentStart, 1000);
  const debouncedSilentEnd = useDebounce(silentEnd, 1000);
  const debouncedTimezone = useDebounce(timezone, 1000);

  useEffect(() => {
    // config ロード完了前（初期空文字列フェーズ）は自動保存しない
    if (!silentHoursLoaded.current) return;
    // Do not autosave a hydration result or a previous account's debounced fields.
    const fields = JSON.stringify([debouncedSilentStart, debouncedSilentEnd, debouncedTimezone]);
    if (
      fields === savedSilentHours.current ||
      fields !== JSON.stringify([silentStart, silentEnd, timezone])
    )
      return;
    saveSilentHours(debouncedSilentStart, debouncedSilentEnd, debouncedTimezone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSilentStart, debouncedSilentEnd, debouncedTimezone]);

  return (
    <>
      <SettingsCategoryPanel
        id="ai"
        hidden={hidden || (activeCategory !== undefined && activeCategory !== "ai")}
      >
        <SettingRow label="AI の実行先">
          <select
            aria-label="AI の実行先"
            value={aiProvider}
            onChange={(event) => {
              if (isAiProviderPreference(event.target.value))
                onChangeAiProvider(event.target.value);
            }}
            className="min-w-0 max-w-full text-[13px] bg-surface-subtle border border-border-default rounded-md px-2 py-1 text-text-default focus:outline-none focus:ring-1 focus:ring-text-muted"
          >
            <option value="auto">自動（Chrome 優先）</option>
            <option value="browser">Chrome 内蔵 AI のみ</option>
            <option value="workers-ai">クラウド（Workers AI）</option>
          </select>
        </SettingRow>
        <p className="text-[11px] text-text-muted pl-28 -mt-2" aria-live="polite">
          {aiProvider === "auto"
            ? "要約・翻訳は Chrome 内蔵 AI を優先し、使えないときに選択したクラウドモデルを使います。"
            : aiProvider === "browser"
              ? "手動・自動の要約と翻訳を Chrome 内蔵 AI で処理します。使えない場合はエラーを表示し、クラウドには送信しません。"
              : "手動・自動の要約と翻訳は選択した Workers AI モデルで処理します。Chrome 内蔵 AI は使用しません。"}{" "}
          このブラウザのアカウントごとに保存します。
        </p>

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

        {aiProvider === "auto" && (
          <>
            <SettingRow label="自動処理は端末のみ">
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
              ON のときは、Chrome AI が使えない記事の自動翻訳・自動要約を省略します。手動の
              AI・翻訳ボタンには適用しません。
            </p>
          </>
        )}

        {aiProvider !== "workers-ai" && (translatorDiag || summarizerDiag) && (
          <div className="flex flex-col gap-1.5 pl-28 text-[11px] text-text-muted">
            {translatorDiag && (
              <span>
                Chrome 翻訳: {translatorDiag.available ? "利用できます" : "現在利用できません"}
              </span>
            )}
            {summarizerDiag && (
              <span>
                Chrome 要約: {summarizerDiag.available ? "利用できます" : "現在利用できません"}
              </span>
            )}
            {(!translatorDiag?.available || !summarizerDiag?.available) && (
              <span>
                Chrome
                の対応状況、モデル・言語パックの準備を確認してください。初回は手動ボタンからの操作が必要な場合があります。
              </span>
            )}
          </div>
        )}

        <SettingRow label="Workers AI モデル">
          <select
            aria-label="Workers AI モデル"
            disabled={aiProvider === "browser"}
            value={aiModel}
            onChange={(e) => onChangeAiModel(e.target.value as WorkersAiModelId)}
            className="min-w-0 max-w-full text-[13px] bg-surface-subtle border border-border-default rounded-md px-2 py-1 text-text-default focus:outline-none focus:ring-1 focus:ring-text-muted disabled:opacity-50"
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
            クラウドで要約・翻訳するときのモデルです。Cloudflare
            の利用料金が発生する場合があり、一部は有料アクセスが必要です。大型モデルは 1 分間 5
            回までです。
          </span>
        </div>
      </SettingsCategoryPanel>
      <SettingsCategoryPanel
        id="notifications"
        hidden={hidden || (activeCategory !== undefined && activeCategory !== "notifications")}
      >
        {!pushEnabled && (
          <p className="text-[12px] text-text-muted">
            このブラウザは Push 通知に対応していません。
          </p>
        )}
        {pushEnabled && (
          <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
            <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
              Push 通知設定
            </span>
            <RecommendationNotificationSettings
              key={userId}
              userId={userId}
              config={recommendationConfig}
              timezone={timezone}
              onTimezoneChange={setTimezone}
            />
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
                  aria-label="Push 通知 タイムゾーン"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="min-w-0 max-w-full text-[13px] bg-surface-subtle border border-border-default rounded-md px-2 py-1 text-text-default focus:outline-none focus:ring-1 focus:ring-text-muted disabled:opacity-50"
                >
                  <option value="">未設定</option>
                  {timezone && !TIMEZONES.includes(timezone) && (
                    <option value={timezone}>{timezone}</option>
                  )}
                  {TIMEZONE_OPTIONS}
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
      </SettingsCategoryPanel>
    </>
  );
}
