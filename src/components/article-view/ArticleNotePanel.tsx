interface ArticleNotePanelProps {
  noteText: string;
  setNoteText: (text: string) => void;
  noteExpanded: boolean;
  setNoteExpanded: (v: boolean) => void;
  handleNoteBlur: () => void;
  note?: string;
}

export default function ArticleNotePanel({
  noteText,
  setNoteText,
  noteExpanded,
  setNoteExpanded,
  handleNoteBlur,
  note,
}: ArticleNotePanelProps) {
  return (
    <div className="mt-10 mb-2">
      <div className="flex items-center gap-1.5 mb-2">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-faint"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <p className="text-[10px] tracking-[0.1em] uppercase text-text-faint">メモ</p>
      </div>
      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        onBlur={handleNoteBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setNoteText(note ?? "");
            if (!note) setNoteExpanded(false);
            e.currentTarget.blur();
          }
        }}
        placeholder="この記事についてのメモ..."
        className="w-full min-h-[80px] resize-y bg-surface-subtle border border-border-subtle rounded-lg px-3 py-2 text-[13px] text-text-default placeholder:text-text-faint focus:outline-none focus:border-border-default transition-colors"
        maxLength={2000}
      />
      <div className="flex items-center justify-between mt-1">
        {noteText !== (note ?? "") ? (
          <p className="text-[10px] text-text-faint">フォーカスを外すと自動保存</p>
        ) : (
          <span />
        )}
        {!noteText.trim() && noteExpanded && !note && (
          <button
            onClick={() => setNoteExpanded(false)}
            className="text-[11px] text-text-faint hover:text-text-muted transition-colors"
          >
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}
