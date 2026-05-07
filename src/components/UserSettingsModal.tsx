"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Modal from "./Modal";
import FeedHealthModal from "./FeedHealthModal";
import { useReaderSettings } from "../contexts/ReaderSettingsContext";
import { useToast } from "@/contexts/ToastContext";
import {
  diagnoseTranslatorAvailability,
  type TranslatorUnavailableReason,
} from "../lib/browser-translator";
import {
  diagnoseSummarizerAvailability,
  type SummarizerUnavailableReason,
} from "../lib/browser-summarizer";
import { downloadBlob } from "../lib/download";
import {
  FONT_SIZE_CYCLE,
  FONT_SIZE_LABELS,
  FONT_FAMILY_CYCLE,
  FONT_FAMILY_LABELS,
  FONT_SIZE_CLASSES,
  FONT_FAMILY_CLASSES,
} from "../lib/article-utils";
import {
  type ContentWidth,
  type LineHeight,
  LINE_HEIGHT_CYCLE,
  LINE_HEIGHT_LABELS,
  CONTENT_WIDTH_CYCLE,
  CONTENT_WIDTH_LABELS,
  GALLERY_COLUMNS_CYCLE,
  GALLERY_COLUMNS_LABELS,
  GALLERY_CARD_SIZE_CYCLE,
  GALLERY_CARD_SIZE_LABELS,
  GALLERY_MIN_IMAGE_PX_MIN,
  GALLERY_MIN_IMAGE_PX_MAX,
  GALLERY_MIN_IMAGE_PX_STEP,
  getLineHeightStyle,
} from "../lib/reader-settings";
import { AUTO_READ_THRESHOLD_CYCLE } from "../hooks/useUIState";
import { ARTICLE_TTL_DAYS } from "../lib/article-ttl";
import { AI_MODELS } from "../lib/ai-models";
import { MAX_FEEDS_PER_USER } from "../lib/shared-feed";
import type { FontFamily, FontSize, Feed } from "../types";
import { useHeaderShareTargets } from "../hooks/useHeaderShareTargets";
import { SHARE_TARGETS, type ShareTargetId } from "./article-view/shareTargets";
import { useDebounce } from "../hooks/useDebounce";

interface Props {
  onClose: () => void;
  feeds: Feed[];
}

// プレビュー領域内でのコンテンツ幅の視覚比率 (modal ~480px 内に収まる表示比率)
// 実値は 640 / 720 / 900 / none だが、モーダル内では全部が収まって見分けが付かないため
// 比率ベースで相対的な広さを表現する
const CONTENT_WIDTH_PREVIEW_PCT: Record<ContentWidth, number> = {
  narrow: 55,
  medium: 70,
  wide: 85,
  full: 100,
};

const TTL_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7日" },
  { value: 14, label: "14日" },
  { value: 30, label: "30日" },
  { value: 60, label: "60日" },
  { value: 90, label: "90日" },
  { value: 0, label: "無制限" },
];

const PREVIEW_TEXT =
  "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。" +
  "The quick brown fox jumps over the lazy dog. RSS リーダーの表示設定をプレビューしながら調整できますわ。";

/**
 * ユーザー設定モーダル (Issue #79, #479)
 *
 * タブ形式で設定カテゴリを分類。
 * 表示 / AI・通知 / フィード管理 / インポート・エクスポート
 */
export default function UserSettingsModal({ onClose, feeds }: Props) {
  const {
    fontSize,
    onChangeFontSize,
    fontFamily,
    onChangeFontFamily,
    lineHeight,
    onChangeLineHeight,
    contentWidth,
    onChangeContentWidth,
    textJustify,
    onChangeTextJustify,
    autoReadEnabled,
    toggleAutoRead,
    autoReadThreshold,
    onChangeAutoReadThreshold,
    autoTranslate,
    toggleAutoTranslate,
    galleryColumns,
    onChangeGalleryColumns,
    galleryCardSize,
    onChangeGalleryCardSize,
    galleryMinImagePx,
    onChangeGalleryMinImagePx,
    deduplicateByLink,
    toggleDeduplicateByLink,
    ttlDays,
    onChangeTtlDays,
    imageDlFolder,
    onChangeImageDlFolder,
    imageDlFolderNsfw,
    onChangeImageDlFolderNsfw,
    aiModel,
    onChangeAiModel,
  } = useReaderSettings();

  const [headerShareTargetIds, setHeaderShareTargetIds] = useHeaderShareTargets();

  const toast = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const [opmlLoading, setOpmlLoading] = useState(false);

  const handleExport = async () => {
    if (opmlLoading) return;
    setOpmlLoading(true);
    try {
      const res = await fetch("/api/feeds/export");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      downloadBlob(blob, "feeds.opml");
      toast.success("エクスポート完了");
    } catch {
      toast.error("エクスポートに失敗しました");
    } finally {
      setOpmlLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset so the same file can be selected again
    e.target.value = "";
    const MAX_OPML_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_OPML_FILE_SIZE) {
      toast.error("OPMLファイルのサイズが大きすぎます（上限5MB）");
      return;
    }
    setOpmlLoading(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/feeds/import", {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: text,
      });
      const data = (await res.json()) as { added?: number; skipped?: number; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "インポートに失敗しました");
      } else {
        toast.success(`${data.added ?? 0}件追加、${data.skipped ?? 0}件スキップ`);
      }
    } catch {
      toast.error("インポートに失敗しました");
    } finally {
      setOpmlLoading(false);
    }
  };

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

  const [showFeedHealth, setShowFeedHealth] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [silentStart, setSilentStart] = useState("");
  const [silentEnd, setSilentEnd] = useState("");
  const [timezone, setTimezone] = useState("");
  const [pushConfigLoading, setPushConfigLoading] = useState(false);
  const silentHoursLoaded = useRef(false);
  const timezones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushEnabled(true);
    fetch("/api/push/config")
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              silentStart: string | null;
              silentEnd: string | null;
              timezone: string | null;
            }>)
          : null,
      )
      .then((data) => {
        if (!data) return;
        setSilentStart(data.silentStart ?? "");
        setSilentEnd(data.silentEnd ?? "");
        setTimezone(data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
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
        const res = await fetch("/api/push/config", {
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

  type TabId = "display" | "ai-notifications" | "feeds" | "import-export";
  const [activeTab, setActiveTab] = useState<TabId>("display");

  const TABS: { id: TabId; label: string }[] = [
    { id: "display", label: "表示" },
    { id: "ai-notifications", label: "AI・通知" },
    { id: "feeds", label: "フィード管理" },
    { id: "import-export", label: "インポート・エクスポート" },
  ];

  return (
    <>
      <Modal
        title="ユーザー設定"
        subtitle="記事表示のカスタマイズ"
        onClose={onClose}
        width="sm:w-[560px]"
      >
        {/* タブナビゲーション */}
        <div
          role="tablist"
          aria-label="設定カテゴリ"
          className="flex border-b border-border-default overflow-x-auto flex-shrink-0"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[13px] border-b-2 whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === tab.id
                  ? "border-ink text-text-strong font-medium"
                  : "border-transparent text-text-muted hover:text-text-default"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 表示タブ */}
        <div
          id="panel-display"
          role="tabpanel"
          aria-labelledby="tab-display"
          hidden={activeTab !== "display"}
        >
          <div className="flex flex-col gap-5 px-5 py-4">
            <PreviewArea
              fontSize={fontSize}
              fontFamily={fontFamily}
              lineHeight={lineHeight}
              contentWidth={contentWidth}
              textJustify={textJustify}
            />

            <SettingRow label="フォントサイズ">
              <SegmentGroup
                options={FONT_SIZE_CYCLE.map((v) => ({
                  value: v,
                  label: FONT_SIZE_LABELS[v],
                }))}
                value={fontSize}
                onChange={onChangeFontSize}
                ariaLabel="フォントサイズ"
              />
            </SettingRow>

            <SettingRow label="フォント">
              <SegmentGroup
                options={FONT_FAMILY_CYCLE.map((v) => ({
                  value: v,
                  label: FONT_FAMILY_LABELS[v],
                }))}
                value={fontFamily}
                onChange={onChangeFontFamily}
                ariaLabel="フォント"
              />
            </SettingRow>

            <SettingRow label="行間">
              <SegmentGroup
                options={LINE_HEIGHT_CYCLE.map((v) => ({
                  value: v,
                  label: LINE_HEIGHT_LABELS[v],
                }))}
                value={lineHeight}
                onChange={onChangeLineHeight}
                ariaLabel="行間"
              />
            </SettingRow>

            <SettingRow label="コンテンツ幅">
              <SegmentGroup
                options={CONTENT_WIDTH_CYCLE.map((v) => ({
                  value: v,
                  label: CONTENT_WIDTH_LABELS[v],
                }))}
                value={contentWidth}
                onChange={onChangeContentWidth}
                ariaLabel="コンテンツ幅"
              />
            </SettingRow>

            <SettingRow label="ギャラリー列数">
              <SegmentGroup
                options={GALLERY_COLUMNS_CYCLE.map((v) => ({
                  value: v,
                  label: GALLERY_COLUMNS_LABELS[v],
                }))}
                value={galleryColumns}
                onChange={onChangeGalleryColumns}
                ariaLabel="ギャラリー列数"
              />
            </SettingRow>

            <SettingRow label="カードサイズ">
              <SegmentGroup
                options={GALLERY_CARD_SIZE_CYCLE.map((v) => ({
                  value: v,
                  label: GALLERY_CARD_SIZE_LABELS[v],
                }))}
                value={galleryCardSize}
                onChange={onChangeGalleryCardSize}
                ariaLabel="カードサイズ"
              />
            </SettingRow>

            <SettingRow label="最小画像サイズ">
              <div className="flex items-center gap-2 w-full">
                <input
                  type="range"
                  min={GALLERY_MIN_IMAGE_PX_MIN}
                  max={GALLERY_MIN_IMAGE_PX_MAX}
                  step={GALLERY_MIN_IMAGE_PX_STEP}
                  value={galleryMinImagePx}
                  onChange={(e) => onChangeGalleryMinImagePx(Number(e.target.value))}
                  className="flex-1 accent-ink h-1 cursor-pointer"
                />
                <span className="text-[11px] text-text-muted tabular-nums w-10 text-right">
                  {galleryMinImagePx === 0 ? "なし" : `${galleryMinImagePx}px`}
                </span>
              </div>
            </SettingRow>

            <SettingRow label="記事保持期間">
              <div className="flex gap-1">
                {TTL_OPTIONS.map((opt) => {
                  const current = ttlDays ?? 30;
                  const isSelected = opt.value === current;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        onChangeTtlDays(opt.value === ARTICLE_TTL_DAYS ? null : opt.value)
                      }
                      className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                        isSelected
                          ? "bg-ink text-ink-text"
                          : "text-text-muted hover:text-text-default hover:bg-surface-hover"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </SettingRow>

            <SettingRow label="両端揃え">
              <button
                type="button"
                role="switch"
                aria-checked={textJustify}
                aria-label={textJustify ? "両端揃えを OFF にする" : "両端揃えを ON にする"}
                onClick={() => onChangeTextJustify(!textJustify)}
                className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
                  textJustify ? "bg-ink" : "bg-border-default"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                    textJustify ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </SettingRow>

            <SettingRow label="自動既読">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoReadEnabled}
                  aria-label={autoReadEnabled ? "自動既読を OFF にする" : "自動既読を ON にする"}
                  onClick={toggleAutoRead}
                  className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
                    autoReadEnabled ? "bg-ink" : "bg-border-default"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                      autoReadEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                {autoReadEnabled && (
                  <SegmentGroup
                    options={AUTO_READ_THRESHOLD_CYCLE.map((v) => ({ value: v, label: `${v}%` }))}
                    value={autoReadThreshold}
                    onChange={onChangeAutoReadThreshold}
                    ariaLabel="自動既読タイミング"
                  />
                )}
              </div>
            </SettingRow>

            <SettingRow label="重複記事の非表示">
              <button
                type="button"
                role="switch"
                aria-checked={deduplicateByLink}
                aria-label={
                  deduplicateByLink
                    ? "クロスフィード重複排除を OFF にする"
                    : "クロスフィード重複排除を ON にする"
                }
                onClick={toggleDeduplicateByLink}
                className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
                  deduplicateByLink ? "bg-ink" : "bg-border-default"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                    deduplicateByLink ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </SettingRow>
            <div className="flex flex-col gap-1 pl-28">
              <span className="text-[11px] text-text-muted">
                同一 URL の記事が複数フィードにある場合、最新の 1 件のみ表示します。
              </span>
            </div>

            <SettingRow label="画像保存フォルダー">
              <input
                type="text"
                placeholder="フォルダ名（空欄: デフォルト）"
                value={imageDlFolder}
                onChange={(e) => onChangeImageDlFolder(e.target.value)}
                className="w-full max-w-[200px] px-2 py-1 text-[11px] rounded-md border border-border-default bg-surface-elevated text-text-default placeholder:text-text-faint focus:outline-none focus:border-ink transition-colors"
              />
            </SettingRow>

            <SettingRow label="画像DL先(NSFW)">
              <input
                type="text"
                placeholder="フォルダ名（空欄: 通常と同じ）"
                value={imageDlFolderNsfw}
                onChange={(e) => onChangeImageDlFolderNsfw(e.target.value)}
                className="w-full max-w-[200px] px-2 py-1 text-[11px] rounded-md border border-border-default bg-surface-elevated text-text-default placeholder:text-text-faint focus:outline-none focus:border-ink transition-colors"
              />
            </SettingRow>
            <div className="flex flex-col gap-1 pl-28">
              <span className="text-[11px] text-text-muted">
                画像ダウンロード時のファイル名にフォルダプレフィックスを付与します。
              </span>
            </div>

            <div className="border-t border-border-subtle pt-4 flex flex-col gap-3">
              <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                シェア設定
              </span>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-text-default">
                  ヘッダーに表示するシェア先
                </span>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                  {SHARE_TARGETS.map((target) => {
                    const checked = headerShareTargetIds.includes(target.id);
                    return (
                      <label
                        key={target.id}
                        className="flex items-center gap-1.5 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? headerShareTargetIds.filter((id) => id !== target.id)
                              : [...headerShareTargetIds, target.id as ShareTargetId];
                            setHeaderShareTargetIds(next);
                          }}
                          className="accent-ink w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="text-[12px] text-text-default">{target.label}</span>
                      </label>
                    );
                  })}
                </div>
                <span className="text-[11px] text-text-muted mt-0.5">
                  チェックしたシェア先が記事ヘッダーにクイックボタンとして表示されます。
                </span>
              </div>
            </div>

            <p className="text-[11px] text-text-muted">
              変更は即座にプレビューに反映され、自動的に保存されますわ。
            </p>
          </div>
        </div>

        {/* AI・通知タブ */}
        <div
          id="panel-ai-notifications"
          role="tabpanel"
          aria-labelledby="tab-ai-notifications"
          hidden={activeTab !== "ai-notifications"}
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
                          "要約モデルをデバイスで使用できません。ストレージ空き容量を確認してください"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <SettingRow label="Workers AI モデル">
              <select
                value={aiModel}
                onChange={(e) =>
                  onChangeAiModel(e.target.value as Parameters<typeof onChangeAiModel>[0])
                }
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
                    設定した時間帯は Push
                    通知を送信しません。開始・終了どちらかが空の場合は無効です。
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* フィード管理タブ */}
        <div
          id="panel-feeds"
          role="tabpanel"
          aria-labelledby="tab-feeds"
          hidden={activeTab !== "feeds"}
        >
          <div className="flex flex-col gap-5 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] text-text-default">
                  登録フィード:{" "}
                  <span
                    className={`font-medium tabular-nums ${
                      feeds.length >= MAX_FEEDS_PER_USER * 0.8
                        ? "text-amber-500"
                        : "text-text-strong"
                    }`}
                  >
                    {feeds.length}
                  </span>
                  <span className="text-text-muted"> / {MAX_FEEDS_PER_USER} 件</span>
                </span>
                {feeds.length >= MAX_FEEDS_PER_USER * 0.8 && (
                  <span className="text-[11px] text-amber-500">上限に近づいています</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowFeedHealth(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors flex-shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                フィードの健全性を確認
              </button>
            </div>
          </div>
        </div>

        {/* インポート・エクスポートタブ */}
        <div
          id="panel-import-export"
          role="tabpanel"
          aria-labelledby="tab-import-export"
          hidden={activeTab !== "import-export"}
        >
          <div className="flex flex-col gap-5 px-5 py-4">
            <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
              フィードのインポート / エクスポート
            </span>
            <div className="flex gap-2">
              {/* OPML エクスポート */}
              <button
                type="button"
                disabled={opmlLoading}
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                OPMLエクスポート
              </button>

              {/* OPML インポート */}
              <input
                ref={importRef}
                type="file"
                accept=".opml,.xml"
                className="hidden"
                onChange={handleImport}
              />
              <button
                type="button"
                disabled={opmlLoading}
                onClick={() => importRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                OPMLインポート
              </button>
            </div>
          </div>
        </div>
      </Modal>
      {showFeedHealth && <FeedHealthModal feeds={feeds} onClose={() => setShowFeedHealth(false)} />}
    </>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] font-medium text-text-default flex-shrink-0 w-24">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}

interface SegmentOption<T> {
  value: T;
  label: string;
}

function SegmentGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const currentIndex = options.findIndex((opt) => opt.value === value);
    if (currentIndex === -1) return;
    const nextIndex =
      e.key === "ArrowRight"
        ? (currentIndex + 1) % options.length
        : (currentIndex - 1 + options.length) % options.length;
    onChange(options[nextIndex].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className="inline-flex rounded-lg border border-border-default overflow-hidden"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-[11px] transition-colors duration-150 ${
              active
                ? "bg-ink text-ink-text"
                : "bg-surface-elevated text-text-muted hover:bg-surface-hover hover:text-text-default"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PreviewArea({
  fontSize,
  fontFamily,
  lineHeight,
  contentWidth,
  textJustify,
}: {
  fontSize: FontSize;
  fontFamily: FontFamily;
  lineHeight: LineHeight;
  contentWidth: ContentWidth;
  textJustify: boolean;
}) {
  return (
    <div className="border border-border-subtle rounded-lg p-3 bg-surface-base">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          Preview
        </span>
        <span className="text-[10px] text-text-faint">幅 {CONTENT_WIDTH_LABELS[contentWidth]}</span>
      </div>
      <div
        className={`mx-auto ${FONT_SIZE_CLASSES[fontSize]} ${FONT_FAMILY_CLASSES[fontFamily]} text-text-soft tracking-[0.02em]`}
        style={{
          ...getLineHeightStyle(lineHeight),
          width: `${CONTENT_WIDTH_PREVIEW_PCT[contentWidth]}%`,
          textAlign: textJustify ? "justify" : "left",
        }}
      >
        {PREVIEW_TEXT}
      </div>
    </div>
  );
}
