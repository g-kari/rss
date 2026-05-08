"use client";

import { useCallback, useState } from "react";
import { useEventListener } from "./useEventListener";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA インストールプロンプトの管理。
 * `beforeinstallprompt` イベントを捕捉してデフォルト動作を抑止し、
 * `canInstall` true のときだけサイドバー等から `onInstall()` を呼べるようにする。
 */
export function usePWAInstall(): {
  canInstall: boolean;
  onInstall: () => Promise<void>;
} {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEventListener(
    "beforeinstallprompt",
    (e) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    },
    window,
  );

  const onInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  return { canInstall: !!installPrompt, onInstall };
}
