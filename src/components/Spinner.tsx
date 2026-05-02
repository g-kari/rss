"use client";

interface Props {
  className?: string;
}

export default function Spinner({ className = "w-3.5 h-3.5" }: Props) {
  return (
    <svg
      className={`animate-spin motion-reduce:animate-none ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      role="status"
      aria-label="読み込み中"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}
