"use client";
import { useState, useEffect } from "react";
import type { UserProfile, EngagementEntry } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { scoreFeedEngagement, topScoredFeeds } from "../lib/engagement-score";

export function useDigestFeedOrder(user: UserProfile | null | undefined): string[] {
  const [feedOrder, setFeedOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/api/engagement")
      .then((r) => r.json() as Promise<{ entries: EngagementEntry[] }>)
      .then(({ entries }) => {
        const scores = scoreFeedEngagement(entries);
        setFeedOrder(topScoredFeeds(scores, 50));
      })
      .catch(() => {});
  }, [user]);

  return feedOrder;
}
