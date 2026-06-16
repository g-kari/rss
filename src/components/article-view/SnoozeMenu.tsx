import { usePortalMenu } from "../../hooks/usePortalMenu";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";
import { MENU_ITEM_CLS } from "./constants";
import { useToast } from "@/contexts/ToastContext";
import PortalMenuShell from "./PortalMenuShell";

const SNOOZE_OPTIONS = [
  { label: "1時間後", durationMs: 60 * 60 * 1000 },
  { label: "3時間後", durationMs: 3 * 60 * 60 * 1000 },
  { label: "明日（1日後）", durationMs: 24 * 60 * 60 * 1000 },
  { label: "来週（1週間後）", durationMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

interface Props {
  articleId: string;
  onSnooze: (id: string, durationMs: number) => void;
  onSelectNext?: () => void;
}

export default function SnoozeMenu({ articleId, onSnooze, onSelectNext }: Props) {
  const toast = useToast();
  const { open, setOpen, toggle, pos, btnRef, menuId } = usePortalMenu();
  const { menuRef, handleKeyDown } = useMenuKeyboard(open, setOpen, btnRef);

  function handleSnooze(durationMs: number, label: string) {
    setOpen(false);
    btnRef.current?.focus();
    onSnooze(articleId, durationMs);
    toast.info(`${label}までスヌーズ`);
    onSelectNext?.();
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="スヌーズ（後で再表示）"
        aria-label="スヌーズ"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`p-2 -m-2 max-md:min-w-[44px] max-md:min-h-[44px] lg:p-0 lg:m-0 lg:min-w-[24px] lg:min-h-[24px] transition-colors duration-200 ${open ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
      >
        <svg
          aria-hidden="true"
          className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>
      {open && (
        <PortalMenuShell
          menuRef={menuRef}
          btnRef={btnRef}
          setOpen={setOpen}
          handleKeyDown={handleKeyDown}
          pos={pos}
          menuId={menuId}
          ariaLabel="スヌーズ"
          className="min-w-[180px]"
        >
          <div className="px-3 pt-2 pb-1">
            <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
              スヌーズ
            </p>
          </div>
          <div className="border-t border-border-subtle">
            {SNOOZE_OPTIONS.map((opt) => (
              <button
                key={opt.durationMs}
                role="menuitem"
                onClick={() => handleSnooze(opt.durationMs, opt.label)}
                className={MENU_ITEM_CLS}
              >
                <svg
                  aria-hidden="true"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
                {opt.label}
              </button>
            ))}
          </div>
        </PortalMenuShell>
      )}
    </>
  );
}
