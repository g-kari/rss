"use client";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-base font-sans antialiased flex flex-col">
      <header className="px-8 py-4 flex items-center justify-between border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            className="text-text-strong"
            aria-hidden="true"
          >
            <rect
              width="22"
              height="22"
              rx="5"
              fill="currentColor"
              fillOpacity="0.08"
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="0.8"
            />
            <circle cx="6" cy="16" r="2.5" fill="currentColor" />
            <path
              d="M6 10.5 A5.5 5.5 0 0 1 11.5 16"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M6 5.5 A10.5 10.5 0 0 1 16.5 16"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[13px] font-medium tracking-[0.04em] text-text-strong">
            RSS Reader
          </span>
        </div>
        <a
          href="/api/auth/login"
          className="text-[12px] tracking-[0.06em] px-4 py-1.5 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
        >
          ログイン
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-20 text-center">
        <p className="text-[11px] tracking-[0.3em] uppercase text-text-faint mb-8 animate-fade-up">
          rss.0g0.xyz
        </p>
        <h1
          className="text-[52px] sm:text-[64px] font-light text-text-strong tracking-[-0.02em] leading-[1.1] mb-5 animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          シンプルな
          <br />
          RSS リーダー
        </h1>
        <p
          className="text-[16px] text-text-muted leading-relaxed mb-10 max-w-sm animate-fade-up"
          style={{ animationDelay: "120ms" }}
        >
          AI 要約・翻訳、4 種のレイアウト、
          <br />
          ダーク / ライトテーマ対応
        </p>
        <a
          href="/api/auth/login"
          className="animate-fade-up inline-flex items-center gap-2 px-8 py-3 bg-ink hover:bg-ink-hover text-ink-text text-[13px] tracking-[0.06em] rounded-full transition-all duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)]"
          style={{ animationDelay: "180ms" }}
        >
          0g0 ID でログイン
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 7h10M8 3l4 4-4 4" />
          </svg>
        </a>
      </main>

      <section
        className="px-8 pb-16 w-full max-w-2xl mx-auto animate-fade-up"
        style={{ animationDelay: "240ms" }}
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "◐", title: "テーマ", desc: "ダーク / ライト" },
            { icon: "⊞", title: "レイアウト", desc: "4 種類" },
            { icon: "✦", title: "AI 機能", desc: "要約・翻訳" },
          ].map((f) => (
            <div
              key={f.title}
              className="px-4 py-4 rounded-xl border border-border-default bg-surface-elevated text-center"
            >
              <div className="text-[20px] mb-2 text-text-muted">{f.icon}</div>
              <div className="text-[13px] font-medium text-text-strong mb-0.5">{f.title}</div>
              <div className="text-[11px] text-text-faint">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-8 py-4 text-center text-[11px] text-text-faint border-t border-border-subtle">
        rss.0g0.xyz — Powered by Cloudflare Workers
      </footer>
    </div>
  );
}
