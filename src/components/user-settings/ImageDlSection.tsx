"use client";

import { ARTICLE_TTL_DAYS } from "../../lib/article-ttl";
import { SHARE_TARGETS, type ShareTargetId } from "../article-view/shareTargets";
import { SettingRow, TTL_OPTIONS, ToggleSwitch } from "./shared";

interface ImageDlSectionProps {
  ttlDays: number | null;
  onChangeTtlDays: (v: number | null) => void;
  deduplicateByLink: boolean;
  toggleDeduplicateByLink: () => void;
  imageDlFolder: string;
  onChangeImageDlFolder: (v: string) => void;
  imageDlFolderNsfw: string;
  onChangeImageDlFolderNsfw: (v: string) => void;
  headerShareTargetIds: ShareTargetId[];
  setHeaderShareTargetIds: (ids: ShareTargetId[]) => void;
}

export default function ImageDlSection({
  ttlDays,
  onChangeTtlDays,
  deduplicateByLink,
  toggleDeduplicateByLink,
  imageDlFolder,
  onChangeImageDlFolder,
  imageDlFolderNsfw,
  onChangeImageDlFolderNsfw,
  headerShareTargetIds,
  setHeaderShareTargetIds,
}: ImageDlSectionProps) {
  return (
    <>
      <SettingRow label="記事保持期間">
        <div className="flex gap-1">
          {TTL_OPTIONS.map((opt) => {
            const current = ttlDays ?? 30;
            const isSelected = opt.value === current;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChangeTtlDays(opt.value === ARTICLE_TTL_DAYS ? null : opt.value)}
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

      <SettingRow label="重複記事の非表示">
        <ToggleSwitch
          checked={deduplicateByLink}
          onChange={() => toggleDeduplicateByLink()}
          ariaLabel={
            deduplicateByLink
              ? "クロスフィード重複排除を OFF にする"
              : "クロスフィード重複排除を ON にする"
          }
        />
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
    </>
  );
}
