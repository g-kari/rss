"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FilterState } from "../hooks/useFilteredArticles";
import type { KeywordFilter } from "../types";

export type ArticleFilter = FilterState & {
  onSaveFilter: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
};

const ArticleFilterContext = createContext<ArticleFilter | null>(null);

interface ProviderProps {
  value: ArticleFilter;
  children: ReactNode;
}

export function ArticleFilterProvider({ value, children }: ProviderProps) {
  return <ArticleFilterContext.Provider value={value}>{children}</ArticleFilterContext.Provider>;
}

export function useArticleFilter(): ArticleFilter {
  const ctx = useContext(ArticleFilterContext);
  if (!ctx) {
    throw new Error("useArticleFilter must be used within an ArticleFilterProvider");
  }
  return ctx;
}
