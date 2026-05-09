import { createElement, type ReactNode } from "react";

export type ShareTargetId = "x" | "bluesky" | "line" | "hatena" | "slack" | "discord";

export interface ShareTarget {
  id: ShareTargetId;
  label: string;
  buildUrl: (link: string, title: string) => string;
  icon: ReactNode;
  clipboardText?: (link: string, title: string) => string;
}

export interface TriggerShareTargetResult {
  /** clipboardText 経由で text を copy したか (UI フィードバック分岐用) */
  copied: boolean;
}

export interface TriggerShareTargetDeps {
  /** clipboard 書き込み (デフォルト: navigator.clipboard.writeText)。テスト時は注入可能 */
  writeText?: (text: string) => Promise<void>;
  /** ウィンドウ open (デフォルト: window.open + noopener,noreferrer)。テスト時は注入可能 */
  openWindow?: (url: string) => void;
}

/**
 * シェアターゲット起動の共通ロジック。
 *
 * `clipboardText` が定義されたターゲット (Slack / Discord 等) は
 *  1. `writeText(text)` で text を copy
 *  2. 成功したら `openWindow(buildUrl)` でアプリを開く
 * `clipboardText` がないターゲット (X / Bluesky / LINE / Hatena 等) は
 *  - `openWindow(buildUrl)` で直接シェア URL を開く
 *
 * UI フィードバック (toast.success / onShareError 等) は呼び出し側で
 * `result.copied` または `.catch(...)` で分岐する。
 *
 * `ArticleHeaderShare` と `ShareMenu` の両方で同一フローを使う重複を解消。
 *
 * 第 4 引数 `deps` は DI 用 (テスト注入)。本番呼出は省略可能。
 */
export async function triggerShareTarget(
  target: ShareTarget,
  link: string,
  title: string,
  deps?: TriggerShareTargetDeps,
): Promise<TriggerShareTargetResult> {
  const writeText = deps?.writeText ?? ((t: string) => navigator.clipboard.writeText(t));
  const openWindow =
    deps?.openWindow ??
    ((u: string) => {
      window.open(u, "_blank", "noopener,noreferrer");
    });
  if (target.clipboardText) {
    const text = target.clipboardText(link, title);
    await writeText(text);
    openWindow(target.buildUrl(link, title));
    return { copied: true };
  }
  openWindow(target.buildUrl(link, title));
  return { copied: false };
}

export const SHARE_TARGETS: ShareTarget[] = [
  {
    id: "x",
    label: "X でシェア",
    buildUrl: (link, title) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}`,
    icon: createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 24 24", fill: "currentColor" },
      createElement("path", {
        d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.833L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z",
      }),
    ),
  },
  {
    id: "bluesky",
    label: "Bluesky でシェア",
    buildUrl: (link, title) =>
      `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title}\n${link}`)}`,
    icon: createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 568 501", fill: "currentColor" },
      createElement("path", {
        d: "M123.121 33.664C188.24 82.553 258.88 181.68 284 234.873c25.12-53.192 95.76-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.748c0 17.46-10.033 146.8-15.914 167.727-20.432 73.21-94.853 91.82-161.048 80.508C507.337 328.795 527.755 396.26 461.455 462.86c-123.063 120.605-176.695-30.26-190.138-68.847-2.857-8.18-4.195-12.011-4.317-8.773-.122-3.238-1.46.594-4.317 8.773-13.443 38.587-67.075 189.452-190.138 68.847-66.3-66.6-45.882-134.065 71.521-156.877-66.195 11.312-140.616-7.298-161.048-80.508C-15.77 204.548-25.803 75.208-25.803 57.748-25.803-28.906 50.134-1.611 123.121 33.664z",
      }),
    ),
  },
  {
    id: "line",
    label: "LINE でシェア",
    buildUrl: (link, title) =>
      `https://line.me/R/share?text=${encodeURIComponent(`${title}\n${link}`)}`,
    icon: createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 24 24", fill: "currentColor" },
      createElement("path", {
        d: "M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314",
      }),
    ),
  },
  {
    id: "hatena",
    label: "はてなブックマーク",
    buildUrl: (link, title) =>
      `https://b.hatena.ne.jp/add?mode=confirm&url=${encodeURIComponent(link)}&title=${encodeURIComponent(title)}`,
    icon: createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none" },
      createElement("rect", {
        x: 1,
        y: 1,
        width: 22,
        height: 22,
        rx: 3,
        fill: "currentColor",
      }),
      createElement(
        "text",
        {
          x: 12,
          y: 17,
          textAnchor: "middle",
          fontSize: 13,
          fontWeight: "bold",
          fill: "var(--color-surface-base)",
          fontFamily: "sans-serif",
        },
        "B!",
      ),
    ),
  },
  {
    id: "slack",
    label: "Slack で共有",
    buildUrl: () => "slack://open",
    clipboardText: (link, title) => `${title}\n${link}`,
    icon: createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 24 24", fill: "currentColor" },
      createElement("path", {
        d: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
      }),
    ),
  },
  {
    id: "discord",
    label: "Discord で共有",
    buildUrl: () => "discord://",
    clipboardText: (link, title) => `${title}\n${link}`,
    icon: createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 24 24", fill: "currentColor" },
      createElement("path", {
        d: "M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z",
      }),
    ),
  },
];
