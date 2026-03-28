"use client";

import { useState, useEffect, useRef } from "react";

export type MobilePane = "sidebar" | "list" | "view";

export function useMobilePane(initial: MobilePane) {
  const [mobilePane, setMobilePane] = useState<MobilePane>(initial);
  const prevRef = useRef<MobilePane>(initial);

  // 前進時に history エントリを積む
  useEffect(() => {
    const prev = prevRef.current;
    if (
      (prev === "sidebar" && mobilePane === "list") ||
      (prev === "list" && mobilePane === "view")
    ) {
      window.history.pushState({ mobilePane }, "");
    }
    prevRef.current = mobilePane;
  }, [mobilePane]);

  // popstate（戻るボタン）でペイン遷移を処理
  useEffect(() => {
    function onPopState() {
      setMobilePane((current) => {
        if (current === "view") return "list";
        if (current === "list") return "sidebar";
        return current;
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return { mobilePane, setMobilePane };
}
