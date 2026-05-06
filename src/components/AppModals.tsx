"use client";

import dynamic from "next/dynamic";
import type { Feed, Article } from "../types";

const KeyboardShortcutsModal = dynamic(() => import("./KeyboardShortcutsModal"), { ssr: false });
const UserSettingsModal = dynamic(() => import("./UserSettingsModal"), { ssr: false });
const FeedQuickSwitchModal = dynamic(() => import("./FeedQuickSwitchModal"), { ssr: false });
const SnoozeModal = dynamic(() => import("./SnoozeModal"), { ssr: false });
const SessionExpiredModal = dynamic(() => import("./SessionExpiredModal"), { ssr: false });

interface Props {
  sessionExpired: boolean;
  snoozeTargetId: string | null;
  snoozeArticleTitle: string;
  onSnooze: (durationMs: number) => void;
  onSnoozeClose: () => void;
  showHelp: boolean;
  onHelpClose: () => void;
  showSettings: boolean;
  onSettingsClose: () => void;
  showFeedSwitcher: boolean;
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  readBeforeTimestamp: string | null;
  selectedFeedId: string | null;
  onSelectFeed: (id: string | null) => void;
  onFeedSwitcherClose: () => void;
}

export default function AppModals({
  sessionExpired,
  snoozeTargetId,
  snoozeArticleTitle,
  onSnooze,
  onSnoozeClose,
  showHelp,
  onHelpClose,
  showSettings,
  onSettingsClose,
  showFeedSwitcher,
  feeds,
  articles,
  readIds,
  readBeforeTimestamp,
  selectedFeedId,
  onSelectFeed,
  onFeedSwitcherClose,
}: Props) {
  return (
    <>
      {sessionExpired && <SessionExpiredModal />}
      {snoozeTargetId && (
        <SnoozeModal
          articleTitle={snoozeArticleTitle}
          onSnooze={onSnooze}
          onClose={onSnoozeClose}
        />
      )}
      {showHelp && <KeyboardShortcutsModal onClose={onHelpClose} />}
      {showSettings && <UserSettingsModal onClose={onSettingsClose} />}
      {showFeedSwitcher && (
        <FeedQuickSwitchModal
          feeds={feeds}
          articles={articles}
          readIds={readIds}
          readBeforeTimestamp={readBeforeTimestamp}
          selectedFeedId={selectedFeedId}
          onSelectFeed={onSelectFeed}
          onClose={onFeedSwitcherClose}
        />
      )}
    </>
  );
}
