import { useState } from "react";
import { createRoot } from "react-dom/client";
import AiNotificationTabPanel from "../../src/components/user-settings/AiNotificationTabPanel";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { useToastState } from "../../src/hooks/useToast";
import { useAiPreferences } from "../../src/hooks/useAiPreferences";
import Modal from "../../src/components/Modal";

function Fixture() {
  const [open, setOpen] = useState(true);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [autoSummarize, setAutoSummarize] = useState(false);
  const [autoAiBrowserOnly, setAutoAiBrowserOnly] = useState(false);
  const settings = useAiPreferences("fixture-user");
  const toast = useToastState();
  return (
    <ToastProvider value={toast}>
      <button onClick={() => setOpen(true)}>設定を開く</button>
      {open && (
        <Modal onClose={() => setOpen(false)} title="AI・通知設定">
          <AiNotificationTabPanel
            userId="fixture-user"
            hidden={false}
            autoTranslate={autoTranslate}
            toggleAutoTranslate={() => setAutoTranslate((value) => !value)}
            autoSummarize={autoSummarize}
            toggleAutoSummarize={() => setAutoSummarize((value) => !value)}
            autoAiBrowserOnly={autoAiBrowserOnly}
            toggleAutoAiBrowserOnly={() => setAutoAiBrowserOnly((value) => !value)}
            {...settings}
          />
        </Modal>
      )}
    </ToastProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
