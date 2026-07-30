"use client";

import { useEffect } from "react";

import { devError } from "@/lib/dev-log";

/** Service Worker をブラウザに登録するクライアントコンポーネント */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        devError("[ServiceWorkerRegistration] navigator.serviceWorker.register failed", err);
      });
    }
  }, []);

  return null;
}
