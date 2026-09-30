// Browser-only fixture: production UI/styles with local mock saves, never a Push subscription.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import RecommendationNotificationSettings from "../../src/components/user-settings/RecommendationNotificationSettings";
import { ToastProvider } from "../../src/contexts/ToastContext";
import Modal from "../../src/components/Modal";
import type { RecommendationPushSettings } from "../../src/hooks/useRecommendationPushSettings";

declare global {
  interface Window {
    recommendationRequests: Record<string, unknown>[];
    failRecommendationSave: boolean;
  }
}
window.recommendationRequests = [];
window.failRecommendationSave = false;
window.fetch = async (_input, init) => {
  window.recommendationRequests.push(JSON.parse(String(init?.body ?? "{}")));
  await new Promise((resolve) => setTimeout(resolve, 40));
  return new Response("{}", { status: window.failRecommendationSave ? 503 : 200 });
};

function Preview() {
  const [config, setConfig] = useState<RecommendationPushSettings | null>(null);
  const [timezone, setTimezone] = useState("Asia/Tokyo");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(true);
  return (
    <ToastProvider
      value={{
        toasts: [],
        success: setMessage,
        error: setMessage,
        info: setMessage,
        undo: () => {},
        dismiss: () => {},
      }}
    >
      <button type="button" onClick={() => setOpen(true)}>
        通知設定を開く
      </button>
      {open && (
        <Modal title="おすすめ記事の通知設定" onClose={() => setOpen(false)}>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-wrap gap-3 text-[12px]">
              <button
                type="button"
                onClick={() =>
                  setConfig({ recommendationEnabled: false, recommendationTime: "09:00" })
                }
              >
                設定を読み込む
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfig(null);
                  setMessage("設定の読み込みに失敗しました");
                }}
              >
                読み込み失敗を再現
              </button>
              <button
                type="button"
                onClick={() => {
                  window.failRecommendationSave = true;
                }}
              >
                保存失敗を再現
              </button>
            </div>
            <RecommendationNotificationSettings
              userId="preview"
              config={config}
              timezone={timezone}
              onTimezoneChange={setTimezone}
            />
            <p role="status" className="text-[12px] text-text-muted">
              {message}
            </p>
          </div>
        </Modal>
      )}
    </ToastProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
