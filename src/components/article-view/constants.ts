/**
 * ドロップダウン / コンテキストメニュー項目の共通スタイル。
 *
 * ShareMenu / FilterMenu / GlobalFilterMenu / SnoozeMenu / ArticleContextMenu /
 * GalleryContextMenu で共有する。`focus-visible:` は keyboard focus 時のみ発動するため
 * (mouse click では CSS 仕様上 `:focus-visible` は発火しない)、click 主体の consumer にも
 * 視覚的な regression はない。
 */
export const MENU_ITEM_CLS =
  "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-text-default hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none transition-colors text-left";
