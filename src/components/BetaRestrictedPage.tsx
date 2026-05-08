"use client";

export default function BetaRestrictedPage() {
  return (
    <div className="min-h-screen bg-surface-base font-sans antialiased flex flex-col items-center justify-center px-8 text-center">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mb-6 text-text-faint">
        <rect
          width="40"
          height="40"
          rx="10"
          fill="currentColor"
          fillOpacity="0.08"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1"
        />
        <path d="M20 12v9M20 27v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className="text-[11px] tracking-[0.3em] uppercase text-text-faint mb-4">Beta Access</p>
      <h1 className="text-[28px] font-light text-text-strong tracking-[-0.01em] mb-3">
        現在クローズドベータ中です
      </h1>
      <p className="text-[14px] text-text-muted leading-relaxed max-w-xs mb-4">
        このサービスは招待制のベータ版です。
      </p>
      <p className="text-[14px] text-text-muted leading-relaxed max-w-xs mb-8">
        アクセスをご希望の方は{" "}
        <a
          href="https://x.com/gizensya_kari"
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-strong underline underline-offset-2 hover:opacity-70 transition-opacity"
        >
          @gizensya_kari
        </a>{" "}
        までご連絡ください。
      </p>
      <a
        href="/api/auth/login"
        className="text-[12px] tracking-[0.06em] px-5 py-2 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
      >
        別のアカウントでログイン
      </a>
    </div>
  );
}
