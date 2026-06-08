/**
 * 全 dropdown / context menu 共通の container class
 * (背景・枠・角丸・影・overflow + position: fixed)。
 *
 * PortalMenuShell (article-view/) / ContextMenuShell (feed-item/) の shell 2 種に加え、
 * shell を流用できない右クリックメニュー (ArticleContextMenu / GalleryContextMenu) も
 * この const を共用する。menu の背景・枠などの design token を変えるときは本 1 箇所のみ更新する。
 * 各メニューは min-w / max-h 等の個別 class をスペース区切りで追記する。
 */
export const BASE_MENU_CLASS =
  "fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden";
