"use client";

import { createContext } from "react";

/** 現在選択中の記事 ID を提供するコンテキスト。
 * ArticleList が Provider として wrapping し、各 ArticleItem が useContext で読む。
 * isSelected を各アイテムの props に含めると selectedArticleId が変わるたびに
 * 全アイテムが re-render されるため、このコンテキストで切り離している。
 */
export const SelectedArticleCtx = createContext<string | null>(null);
