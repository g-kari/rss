// Synthetic data around the production UI. The fixture never implements summary selection.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ImmersiveArticleMode, {
  type ImmersiveSessionSnapshot,
} from "../../src/components/ImmersiveArticleMode";
import {
  ReaderSettingsProvider,
  type ReaderSettings,
} from "../../src/contexts/ReaderSettingsContext";
import { VisualModeProvider } from "../../src/contexts/VisualModeContext";
import { DEFAULT_AI_MODEL, type WorkersAiModelId } from "../../src/lib/ai-models";
import type { AiProviderPreference } from "../../src/lib/ai-preferences";
import type { Article, Feed } from "../../src/types";

const now = Date.parse("2026-10-02T00:00:00Z");
const parameters = new URLSearchParams(location.search);
const fixtureCase = parameters.get("case");
const theme = parameters.get("theme") === "light" ? "light" : "dark";
const userId = "summary-test";
const empty = new Set<string>();
const noop = () => {};
const description = (index: number) =>
  fixtureCase === "long-fallback"
    ? `フィード説明 ${index + 1}。${Array.from(
        { length: 100 },
        (_, paragraph) => `読み込み済みの説明の段落 ${paragraph + 1} を自分のペースで読みます。`,
      ).join("\n\n")}`
    : `フィード説明 ${index + 1}。すでに読み込んだ説明を自分のペースで読みます。保存済みの要約を確認しても新しいAI処理は行いません。`;
const articles: Article[] = Array.from({ length: 23 }, (_, index) => ({
  id: String(index),
  feedHash: "summary-preview",
  guid: String(index),
  title: `要約テスト記事 ${index + 1}：読み込み済みの記事を選びます`,
  link: `https://example.com/summary-fixture/${index}`,
  summary: description(index),
  content: `<p>${description(index)}</p>`,
  publishedAt: new Date(now - index * 60_000).toISOString(),
  createdAt: new Date(now).toISOString(),
}));
const feeds: Feed[] = [
  {
    id: "summary-preview",
    title: "Synthetic Summary Feed",
    url: "https://example.com/summary-fixture/feed",
    siteUrl: "https://example.com",
    lastFetchedAt: null,
    fetchError: null,
  },
];

interface Account {
  userId: string | null;
  authUsable: boolean;
  scopeKey: string;
}
export interface SummaryFixtureControls {
  setModel: (model: WorkersAiModelId) => void;
  setProvider: (provider: AiProviderPreference) => void;
  setAccount: (account: Account) => void;
  setSettingsUser: (id: string | null) => void;
  setArticleCount: (count: number) => void;
}

function Preview() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ImmersiveSessionSnapshot | null>(null);
  const [read, setRead] = useState(new Set<string>());
  const [readEvents, setReadEvents] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(new Set<string>());
  const [dismissed, setDismissed] = useState(new Set<string>());
  const [articleCount, setArticleCount] = useState(23);
  const [model, setModel] = useState<WorkersAiModelId>(DEFAULT_AI_MODEL);
  const [provider, setProvider] = useState<AiProviderPreference>(
    fixtureCase === "browser" ? "browser" : fixtureCase === "auto" ? "auto" : "workers-ai",
  );
  const [account, setAccount] = useState<Account>({
    userId: fixtureCase === "no-auth" ? null : userId,
    authUsable: fixtureCase !== "unusable-auth" && fixtureCase !== "no-auth",
    scopeKey: "summary-scope-a",
  });
  const [settingsUser, setSettingsUser] = useState<string | null>(
    fixtureCase === "wrong-user" ? "another-user" : userId,
  );
  const markRead = useCallback((id: string) => {
    setRead((previous) => new Set([...previous, id]));
    setReadEvents((previous) => [...previous, id]);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const fixture = window as typeof window & { summaryFixture?: SummaryFixtureControls };
    fixture.summaryFixture = {
      setModel,
      setProvider,
      setAccount,
      setSettingsUser,
      setArticleCount,
    };
    return () => {
      delete fixture.summaryFixture;
    };
  }, []);
  const settings = useMemo<ReaderSettings>(
    () => ({
      fontSize: "medium",
      onChangeFontSize: noop,
      fontFamily: "sans",
      onChangeFontFamily: noop,
      theme,
      setTheme: noop,
      focusMode: false,
      toggleFocusMode: noop,
      autoReadEnabled: true,
      toggleAutoRead: noop,
      autoReadThreshold: 80,
      cycleAutoReadThreshold: noop,
      onChangeAutoReadThreshold: noop,
      // True deliberately: summary inspection must not inherit reader auto-AI effects.
      autoTranslate: true,
      toggleAutoTranslate: noop,
      autoSummarize: true,
      toggleAutoSummarize: noop,
      autoAiBrowserOnly: false,
      toggleAutoAiBrowserOnly: noop,
      lineHeight: "normal",
      onChangeLineHeight: noop,
      contentWidth: "medium",
      onChangeContentWidth: noop,
      textJustify: false,
      onChangeTextJustify: noop,
      galleryColumns: "auto",
      onChangeGalleryColumns: noop,
      galleryColumnsFocus: "auto",
      onChangeGalleryColumnsFocus: noop,
      galleryCardSize: "medium",
      onChangeGalleryCardSize: noop,
      galleryMinImagePx: 0,
      onChangeGalleryMinImagePx: noop,
      galleryAutoScrollSpeed: "off",
      onChangeGalleryAutoScrollSpeed: noop,
      galleryPageSize: 50,
      onChangeGalleryPageSize: noop,
      deduplicateByLink: true,
      toggleDeduplicateByLink: noop,
      ttlDays: null,
      onChangeTtlDays: noop,
      imageDlFolder: "",
      onChangeImageDlFolder: noop,
      imageDlFolderNsfw: "",
      onChangeImageDlFolderNsfw: noop,
      aiProvider: provider,
      onChangeAiProvider: setProvider,
      aiUserId: settingsUser,
      aiModel: model,
      onChangeAiModel: setModel,
    }),
    [model, provider, settingsUser],
  );
  const available = articles.slice(0, articleCount);
  const ui = (
    <main className="min-h-dvh bg-surface-base p-6 text-text-strong">
      <button className="min-h-11" onClick={() => setOpen(true)}>
        ドパガキモードを開く
      </button>
      <p data-testid="selected-article">{selected ?? "なし"}</p>
      <p data-testid="read-ids">{JSON.stringify([...read])}</p>
      <p data-testid="read-events">{JSON.stringify(readEvents)}</p>
      <p data-testid="session-served-ids">
        {JSON.stringify(session?.served.map((article) => article.id) ?? [])}
      </p>
      <p data-testid="fixture-model">{model}</p>
      <p data-testid="fixture-account">{JSON.stringify({ ...account, settingsUser, provider })}</p>
      {open && (
        <ImmersiveArticleMode
          summaryAccount={fixtureCase === "no-account" ? undefined : account}
          session={session}
          onSessionChange={setSession}
          candidates={available}
          articles={available}
          feeds={feeds}
          now={now}
          readIds={read}
          bookmarkIds={empty}
          likeIds={empty}
          historyIds={empty}
          readingListIds={saved}
          dismissedIds={dismissed}
          onClose={() => setOpen(false)}
          onSelectArticle={(article) => setSelected(article.id)}
          onMarkRead={markRead}
          onToggleReadingList={(id) =>
            setSaved((previous) => {
              const next = new Set(previous);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onDismiss={(id) => setDismissed((previous) => new Set([...previous, id]))}
          onRestore={(id) =>
            setDismissed((previous) => {
              const next = new Set(previous);
              next.delete(id);
              return next;
            })
          }
        />
      )}
    </main>
  );
  return fixtureCase === "no-settings" ? (
    ui
  ) : (
    <ReaderSettingsProvider value={settings}>{ui}</ReaderSettingsProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <VisualModeProvider>
    <Preview />
  </VisualModeProvider>,
);
