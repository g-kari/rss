"use client";

import { useEffect, useState } from "react";

interface Props {
  onComplete: () => void;
}

type Phase = "closed" | "opening" | "open" | "fading";

export default function NSFWEyeAnimation({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("closed");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("opening"), 80);
    const t2 = setTimeout(() => setPhase("open"), 1400);
    const t3 = setTimeout(() => setPhase("fading"), 2100);
    const t4 = setTimeout(() => onComplete(), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  const isOpen = phase === "open" || phase === "fading";
  const isFading = phase === "fading";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      style={{ opacity: isFading ? 0 : 1, transition: isFading ? "opacity 0.7s ease-in" : "none" }}
    >
      <div style={{ width: 480, position: "relative" }}>
        <svg viewBox="0 0 480 200" width="480" height="200" style={{ display: "block" }}>
          {/* 白目（sclera） */}
          <path
            d="M 30,100 Q 240,0 450,100 Q 240,200 30,100 Z"
            fill="white"
            stroke="#d1d5db"
            strokeWidth="1"
          />

          {/* 虹彩（iris） */}
          <circle cx="240" cy="100" r="52" fill="#4f46e5" />
          <circle cx="240" cy="100" r="52" fill="none" stroke="#3730a3" strokeWidth="2" />
          {/* 虹彩のテクスチャライン */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const x1 = 240 + 28 * Math.cos(angle);
            const y1 = 100 + 28 * Math.sin(angle);
            const x2 = 240 + 50 * Math.cos(angle);
            const y2 = 100 + 50 * Math.sin(angle);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#3730a3"
                strokeWidth="1"
                opacity="0.5"
              />
            );
          })}

          {/* 瞳孔 */}
          <circle cx="240" cy="100" r="26" fill="#0f0f1a" />

          {/* ハイライト */}
          <circle cx="255" cy="86" r="9" fill="white" opacity="0.85" />
          <circle cx="228" cy="108" r="5" fill="white" opacity="0.4" />

          {/* 上まぶた — 閉じているときは覆い被さる、開くと上に移動 */}
          <g
            style={{
              transform: isOpen ? "translateY(-160px)" : "translateY(0px)",
              transition: isOpen ? "transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            }}
          >
            <path d="M 30,100 Q 240,-20 450,100 L 450,-60 L 30,-60 Z" fill="#0f0f1a" />
            {/* 上まつ毛 */}
            {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t, i) => {
              const x = 30 + t * 420;
              const cpX = 240;
              const cpY = -20;
              const bx = (1 - t) * (1 - t) * 30 + 2 * (1 - t) * t * cpX + t * t * 450;
              const by = (1 - t) * (1 - t) * 100 + 2 * (1 - t) * t * cpY + t * t * 100;
              const len = 8 + Math.sin(t * Math.PI) * 6;
              return (
                <line
                  key={i}
                  x1={bx}
                  y1={by}
                  x2={bx + (x - 240) * 0.03}
                  y2={by - len}
                  stroke="#0f0f1a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* 下まぶた — 閉じているときは覆い被さる、開くと下に移動 */}
          <g
            style={{
              transform: isOpen ? "translateY(160px)" : "translateY(0px)",
              transition: isOpen ? "transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
            }}
          >
            <path d="M 30,100 Q 240,220 450,100 L 450,260 L 30,260 Z" fill="#0f0f1a" />
            {/* 下まつ毛 */}
            {[0.2, 0.35, 0.5, 0.65, 0.8].map((t, i) => {
              const cpX = 240;
              const cpY = 220;
              const bx = (1 - t) * (1 - t) * 30 + 2 * (1 - t) * t * cpX + t * t * 450;
              const by = (1 - t) * (1 - t) * 100 + 2 * (1 - t) * t * cpY + t * t * 100;
              const len = 5 + Math.sin(t * Math.PI) * 4;
              return (
                <line
                  key={i}
                  x1={bx}
                  y1={by}
                  x2={bx}
                  y2={by + len}
                  stroke="#0f0f1a"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        </svg>

        {/* "nsfw mode" テキスト */}
        <div
          style={{
            position: "absolute",
            bottom: -40,
            left: 0,
            right: 0,
            textAlign: "center",
            // text label のみ theme 追従 (eye SVG presentation attributes は artistic intent で固定色維持)
            color: "var(--color-accent-dot)",
            fontSize: 13,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            opacity: phase === "open" ? 1 : 0,
            transition: phase === "open" ? "opacity 0.5s ease-in" : "none",
            fontFamily: "monospace",
          }}
        >
          nsfw mode
        </div>
      </div>
    </div>
  );
}
