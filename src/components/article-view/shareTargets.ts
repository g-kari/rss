import React from "react";

export type ShareTargetId = "x" | "bluesky" | "line" | "hatena";

export interface ShareTarget {
  id: ShareTargetId;
  label: string;
  buildUrl: (link: string, title: string) => string;
  icon: React.ReactNode;
}

export const SHARE_TARGETS: ShareTarget[] = [
  {
    id: "x",
    label: "X でシェア",
    buildUrl: (link, title) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}`,
    icon: React.createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 24 24", fill: "currentColor" },
      React.createElement("path", {
        d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.833L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z",
      }),
    ),
  },
  {
    id: "bluesky",
    label: "Bluesky でシェア",
    buildUrl: (link, title) =>
      `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title}\n${link}`)}`,
    icon: React.createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 568 501", fill: "currentColor" },
      React.createElement("path", {
        d: "M123.121 33.664C188.24 82.553 258.88 181.68 284 234.873c25.12-53.192 95.76-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.748c0 17.46-10.033 146.8-15.914 167.727-20.432 73.21-94.853 91.82-161.048 80.508C507.337 328.795 527.755 396.26 461.455 462.86c-123.063 120.605-176.695-30.26-190.138-68.847-2.857-8.18-4.195-12.011-4.317-8.773-.122-3.238-1.46.594-4.317 8.773-13.443 38.587-67.075 189.452-190.138 68.847-66.3-66.6-45.882-134.065 71.521-156.877-66.195 11.312-140.616-7.298-161.048-80.508C-15.77 204.548-25.803 75.208-25.803 57.748-25.803-28.906 50.134-1.611 123.121 33.664z",
      }),
    ),
  },
  {
    id: "line",
    label: "LINE でシェア",
    buildUrl: (link, title) =>
      `https://line.me/R/share?text=${encodeURIComponent(`${title}\n${link}`)}`,
    icon: React.createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 24 24", fill: "currentColor" },
      React.createElement("path", {
        d: "M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314",
      }),
    ),
  },
  {
    id: "hatena",
    label: "はてなブックマーク",
    buildUrl: (link, title) =>
      `https://b.hatena.ne.jp/add?mode=confirm&url=${encodeURIComponent(link)}&title=${encodeURIComponent(title)}`,
    icon: React.createElement(
      "svg",
      { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none" },
      React.createElement("rect", {
        x: 1,
        y: 1,
        width: 22,
        height: 22,
        rx: 3,
        fill: "currentColor",
      }),
      React.createElement(
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
];
