"use client";

import { useState } from "react";
import FeedHealthModal from "../FeedHealthModal";
import { MAX_FEEDS_PER_USER } from "../../lib/shared-feed";
import type { Feed } from "../../types";

interface FeedManagementTabPanelProps {
  hidden: boolean;
  feeds: Feed[];
}

export default function FeedManagementTabPanel({ hidden, feeds }: FeedManagementTabPanelProps) {
  const [showFeedHealth, setShowFeedHealth] = useState(false);

  return (
    <>
      <div id="panel-feeds" role="tabpanel" aria-labelledby="tab-feeds" hidden={hidden}>
        <div className="flex flex-col gap-5 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] text-text-default">
                登録フィード:{" "}
                <span
                  className={`font-medium tabular-nums ${
                    feeds.length >= MAX_FEEDS_PER_USER * 0.8 ? "text-amber-500" : "text-text-strong"
                  }`}
                >
                  {feeds.length}
                </span>
                <span className="text-text-muted"> / {MAX_FEEDS_PER_USER} 件</span>
              </span>
              {feeds.length >= MAX_FEEDS_PER_USER * 0.8 && (
                <span className="text-[11px] text-amber-500">上限に近づいています</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFeedHealth(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-border-default text-text-default hover:bg-surface-hover transition-colors flex-shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              フィードの健全性を確認
            </button>
          </div>
        </div>
      </div>
      {showFeedHealth && <FeedHealthModal feeds={feeds} onClose={() => setShowFeedHealth(false)} />}
    </>
  );
}
