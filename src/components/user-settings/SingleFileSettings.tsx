"use client";
import { useEffect, useState } from "react";
import { useSingleFileSettings } from "../../hooks/useSingleFileSettings";
import { useToast } from "../../contexts/ToastContext";

interface Props {
  userId: string;
  active: boolean;
}
const buttonClass =
  "self-start px-3 py-1.5 min-h-[32px] text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed";
export default function SingleFileSettings({ userId, active }: Props) {
  const settings = useSingleFileSettings(userId, active);
  const [endpoint, setEndpoint] = useState("");
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  useEffect(() => {
    setEndpoint(`${window.location.origin}/api/clip`);
  }, []);
  useEffect(() => {
    setConfirming(false);
  }, [userId, active]);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("コピーしました");
    } catch {
      toast.error("コピーできませんでした。表示欄からコピーしてください。");
    }
  }
  return (
    <section className="flex flex-col gap-3" aria-label="SingleFile 連携設定">
      <span className="text-meta font-medium tracking-[0.25em] uppercase text-text-muted">
        SingleFile 連携
      </span>
      <p className="text-[12px] text-text-soft leading-relaxed">
        ページの本文と埋め込み画像をあなた専用に保存し、「すべての記事」に追加します。リーダー用に整えるため、元ページのレイアウトやスクリプトは保存しません。
      </p>
      <ol className="list-decimal pl-5 text-[12px] text-text-soft space-y-1">
        <li>下のボタンで保存専用トークンを発行します（30日間有効）。</li>
        <li>SingleFile の設定 → 保存先で「upload to a REST Form API」を選びます。</li>
        <li>URL に下記の保存先、authorization token に発行したトークンを入力します。</li>
        <li>archive data field name は「html」、archive URL field name は「url」にします。</li>
        <li>ファイル形式は「HTML」にします（ZIP・自己解凍ZIPには非対応）。</li>
      </ol>
      <label className="text-[11px] text-text-muted" htmlFor="singlefile-endpoint">
        保存先 URL
      </label>
      <div className="flex gap-2">
        <input
          id="singlefile-endpoint"
          readOnly
          value={endpoint}
          className="min-w-0 flex-1 px-3 py-1.5 text-[12px] rounded-lg bg-surface-subtle border border-border-subtle font-mono"
        />
        <button
          type="button"
          className={buttonClass}
          onClick={() => void copy(endpoint)}
          disabled={!endpoint}
        >
          URLをコピー
        </button>
      </div>
      <p className="text-[11px] text-text-muted">
        HTML全体で5MiB、埋め込み画像はPNG・JPEG・GIF・WebPを128種類まで。SVG等のdata画像は非対応です。送信は1分に1回まで。保存後は記事一覧を更新してください。
      </p>
      <p className="text-[11px] text-text-muted">
        トークンが許可するのは記事の保存だけです。記事の読み取り・削除や設定変更はできません。再発行すると以前のトークンは使えなくなります。
      </p>
      {settings.error && (
        <p role="alert" className="text-[12px] text-red-500">
          {settings.error}
        </p>
      )}
      {!settings.loaded && (
        <button type="button" className={buttonClass} onClick={settings.refresh}>
          設定を再読み込み
        </button>
      )}
      {settings.metadata && (
        <p className="text-[12px] text-text-soft">
          有効期限: {new Date(settings.metadata.expiresAt).toLocaleString()}
        </p>
      )}
      {settings.secret && (
        <div className="flex flex-col gap-2">
          <label htmlFor="singlefile-token" className="text-[11px] text-text-muted">
            保存専用トークン（この表示を閉じると再表示できません）
          </label>
          <input
            id="singlefile-token"
            type="text"
            readOnly
            autoComplete="off"
            spellCheck={false}
            value={settings.secret}
            className="w-full px-3 py-1.5 text-[12px] rounded-lg bg-surface-subtle border border-border-subtle font-mono"
          />
          <button type="button" className={buttonClass} onClick={() => void copy(settings.secret)}>
            トークンをコピー
          </button>
        </div>
      )}
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text-soft">
            このアカウントに記事を保存できるトークンを発行します。SingleFile以外に共有しないでください。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={settings.busy || !settings.loaded}
              onClick={() => {
                setConfirming(false);
                void settings.issue();
              }}
            >
              発行する
            </button>
            <button type="button" className={buttonClass} onClick={() => setConfirming(false)}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={settings.busy || !settings.loaded}
            onClick={() => setConfirming(true)}
          >
            {settings.metadata ? "保存専用トークンを再発行" : "保存専用トークンを発行"}
          </button>
          {settings.metadata && (
            <button
              type="button"
              className={buttonClass}
              disabled={settings.busy}
              onClick={() => void settings.revoke()}
            >
              トークンを失効
            </button>
          )}
        </div>
      )}
    </section>
  );
}
