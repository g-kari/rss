import React, { useMemo, useState } from "react";
import type { Article, KeywordFilter } from "../../types";
import { usePortalMenu } from "../../hooks/usePortalMenu";
import { MENU_ITEM_CLS } from "./constants";
import { XIcon } from "./icons";

/** XML キーを日本語ラベルに変換する */
function metaLabel(key: string): string {
  const map: Record<string, string> = {
    "dc:corp": "企業",
    "dc:creator": "著者",
    "dc:subject": "テーマ",
    "dc:publisher": "出版社",
    "dc:type": "種別",
    "dc:rights": "権利",
    business_form: "業種",
    service: "サービス",
    industry: "業界",
    category: "カテゴリ",
    tag: "タグ",
    source: "情報源",
    department: "部署",
    genre: "ジャンル",
    region: "地域",
    prefecture: "都道府県",
    country: "国",
  };
  return map[key] ?? key.replace(/^[a-z]+:/i, "");
}

/** 除外キーワード候補を記事情報から生成する */
export function buildExcludeOptions(article: Article): { label: string; value: string }[] {
  return [
    { label: "この記事", value: article.title },
    ...(article.author ? [{ label: `著者「${article.author}」`, value: article.author }] : []),
    ...(article.categories ?? []).map((cat) => ({ label: `カテゴリ「${cat}」`, value: cat })),
    ...(article.metadata ?? []).map((m) => ({
      label: `${metaLabel(m.key)}「${m.value}」`,
      value: m.value,
    })),
  ];
}

/** FilterMenu / GlobalFilterMenu 共通の状態管理フック */
export function useFilterMenuState(
  article: Article,
  currentFilter: KeywordFilter | null | undefined,
) {
  const { open, setOpen, toggle, pos, btnRef } = usePortalMenu();
  const [modalOpen, setModalOpen] = useState(false);
  const hasFilter = !!(
    currentFilter &&
    (currentFilter.include.length > 0 || currentFilter.exclude.length > 0)
  );
  const excludeOptions = useMemo(() => buildExcludeOptions(article), [article]);
  return { open, setOpen, toggle, pos, btnRef, modalOpen, setModalOpen, hasFilter, excludeOptions };
}

/** FilterMenu / GlobalFilterMenu 共通の除外オプション一覧 */
export function ExcludeOptionsSection({
  label,
  options,
  onExclude,
}: {
  label: string;
  options: { label: string; value: string }[];
  onExclude: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="border-t border-border-subtle">
      <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
        {label}
      </p>
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onExclude(opt.value)} className={MENU_ITEM_CLS}>
          {XIcon}
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
