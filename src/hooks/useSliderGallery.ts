"use client";

import { useEffect, type RefObject } from "react";

/**
 * 記事本文内の `.rss-image-slider` に PC 用の前後ナビボタンと
 * ホイール横スクロール制御を注入する副作用のみの hook。
 * `processedContent` が変わるたびに再注入する（二重注入は内部でガード）。
 */
export function useSliderGallery(
  contentRef: RefObject<HTMLDivElement | null>,
  processedContent: string | null,
): void {
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const sliders = el.querySelectorAll<HTMLElement>(".rss-image-slider");
    sliders.forEach((slider) => {
      if (slider.closest(".rss-slider-wrapper")) return; // 二重注入を防止

      // スライダーを相対配置のラッパーで包む
      const wrapper = document.createElement("div");
      wrapper.className = "rss-slider-wrapper";
      wrapper.style.cssText = "position:relative;margin-bottom:1.25em";
      slider.style.marginBottom = "0";
      slider.parentNode?.insertBefore(wrapper, slider);
      wrapper.appendChild(slider);

      function makeNavBtn(dir: "prev" | "next") {
        const btn = document.createElement("button");
        const side = dir === "prev" ? "left:8px" : "right:8px";
        btn.setAttribute("aria-label", dir === "prev" ? "前の画像" : "次の画像");
        btn.style.cssText =
          `position:absolute;${side};top:50%;transform:translateY(-50%);` +
          `width:32px;height:32px;border-radius:50%;` +
          `background:rgba(0,0,0,0.45);color:white;border:none;cursor:pointer;` +
          `display:flex;align-items:center;justify-content:center;` +
          `opacity:0;transition:opacity 0.15s;z-index:1;padding:0;flex-shrink:0`;
        const path = dir === "prev" ? "M9 2L4 7l5 5" : "M5 2l5 5-5 5";
        btn.innerHTML =
          `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" ` +
          `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
          `<path d="${path}"/></svg>`;
        btn.addEventListener("click", () =>
          slider.scrollBy({
            left: dir === "prev" ? -slider.clientWidth : slider.clientWidth,
            behavior: "smooth",
          }),
        );
        wrapper.appendChild(btn);
        return btn;
      }

      const prevBtn = makeNavBtn("prev");
      const nextBtn = makeNavBtn("next");
      wrapper.addEventListener("mouseenter", () => {
        prevBtn.style.opacity = "1";
        nextBtn.style.opacity = "1";
      });
      wrapper.addEventListener("mouseleave", () => {
        prevBtn.style.opacity = "0";
        nextBtn.style.opacity = "0";
      });

      // マウスホイールの縦スクロールを横スクロールに変換（PC 操作性向上）
      slider.addEventListener(
        "wheel",
        (e: WheelEvent) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          e.preventDefault();
          slider.scrollBy({
            left: e.deltaY > 0 ? slider.clientWidth : -slider.clientWidth,
            behavior: "smooth",
          });
        },
        { passive: false },
      );
    });
    // contentRef は安定参照のため deps から除外（元実装と揃える）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedContent]);
}
