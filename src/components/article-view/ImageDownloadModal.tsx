interface ImageDownloadModalProps {
  isAlreadyDownloaded: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ImageDownloadModal({
  isAlreadyDownloaded,
  onConfirm,
  onCancel,
}: ImageDownloadModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-surface-elevated border border-border-default rounded-xl p-6 shadow-xl max-w-sm mx-4 w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-text-strong text-[14px] font-medium mb-2">
          {isAlreadyDownloaded ? "再ダウンロード" : "画像をダウンロード"}
        </p>
        <p className="text-text-soft text-[13px] mb-5">
          {isAlreadyDownloaded
            ? "この記事の画像はすでに保存済みです。再度ダウンロードしますか？"
            : "記事内の画像をすべてダウンロードします。よろしいですか？"}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-lg text-[13px] text-text-muted hover:text-text-default transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => void onConfirm()}
            className="px-4 py-1.5 rounded-lg text-[13px] bg-ink hover:bg-ink-hover text-ink-text transition-colors"
          >
            ダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}
