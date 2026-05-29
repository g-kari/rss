"use client";

import { createContext } from "react";

/** 一括操作対象の記事 ID 集合を提供する Context (#883)。
 *
 * 単一選択用の `SelectedArticleCtx` (string | null) とは独立して提供する。
 * - `useContext(BulkSelectionCtx)` は ArticleItem の bulk-selected 視覚化のみに使用
 * - 空 Set は「bulk 非活性」と等価 (BulkActionToolbar も非表示)
 * - Set の identity が変わると useContext consumer 全件が再評価されるが、
 *   item レベルの `useMemo(() => ctx.has(id), [ctx, id])` で局所判定する
 */
export const BulkSelectionCtx = createContext<ReadonlySet<string>>(new Set());
