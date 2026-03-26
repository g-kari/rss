"use client";

import { useEffect } from "react";

/** Service Worker をブラウザに登録するクライアントコンポーネント */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
