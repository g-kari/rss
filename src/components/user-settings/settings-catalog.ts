/** Static UI metadata only. Never index user data, tokens, or live service responses. */
export const SETTINGS_CATEGORIES = [
  { id: "reading", label: "読書・表示", description: "文字・本文の見やすさと自動既読" },
  { id: "gallery", label: "ギャラリー", description: "画像一覧・カードと自動スクロール" },
  { id: "voice", label: "読み上げ", description: "音声・音量と読み上げエンジン" },
  { id: "ai", label: "AI・翻訳", description: "要約・翻訳の実行先と自動処理" },
  { id: "notifications", label: "通知", description: "おすすめ・エラー通知とサイレント時間帯" },
  { id: "feeds", label: "フィード管理", description: "登録数とフィードの健全性" },
  { id: "storage", label: "保存・共有", description: "記事保持・重複排除と画像保存・シェア先" },
  {
    id: "import-export",
    label: "バックアップ・連携",
    description: "OPML・JSON の入出力と SingleFile",
  },
] as const;
export type SettingsCategoryId = (typeof SETTINGS_CATEGORIES)[number]["id"];
export interface SettingDestination {
  id: string;
  category: SettingsCategoryId;
  label: string;
  description: string;
  aliases: string;
  /** Non-row settings provide a scoped selector instead of a data-setting-id row. */
  selector?: string;
  /** An informational destination remains available without an editable control. */
  informational?: boolean;
}
// Placement rule: one destination per existing setting/group of related actions.
// Keep daily typography in reading; advanced voice, AI, notification, storage and backup
// controls belong to their purpose category. Add static aliases + an inventory test with UI changes.
export const SETTINGS_CATALOG: readonly SettingDestination[] = [
  {
    id: "nsfw-mode",
    informational: true,
    category: "reading",
    label: "NSFW表示",
    description: "現在の表示状態を確認・NSFWモード解除",
    aliases: "成人向け 通常表示 モード 解除",
  },
  {
    id: "presets",
    category: "reading",
    label: "プリセット",
    description: "テーマ・フォント・本文の幅を名前付きで保存・適用・JSON 入出力",
    aliases: "theme テーマ preset 外観",
  },
  {
    id: "font-size",
    category: "reading",
    label: "フォントサイズ",
    description: "本文の文字の大きさ",
    aliases: "文字サイズ 文字 サイズ 大きさ font size",
  },
  {
    id: "font-family",
    category: "reading",
    label: "フォント",
    description: "本文の書体を選ぶ",
    aliases: "font family 書体 明朝 ゴシック",
  },
  {
    id: "line-height",
    category: "reading",
    label: "行間",
    description: "本文の行の間隔",
    aliases: "line height spacing",
  },
  {
    id: "content-width",
    category: "reading",
    label: "コンテンツ幅",
    description: "本文の横幅を選ぶ",
    aliases: "content width 本文 幅",
  },
  {
    id: "text-justify",
    category: "reading",
    label: "両端揃え",
    description: "本文の左右の端を揃える",
    aliases: "justify 字詰め",
  },
  {
    id: "auto-read",
    category: "reading",
    label: "自動既読",
    description: "記事を読んだ位置で既読にする・既読タイミング",
    aliases: "auto read threshold 閾値",
  },
  {
    id: "auto-read-threshold",
    category: "reading",
    label: "自動既読タイミング",
    description: "自動既読が有効なとき、既読にする位置を選ぶ",
    aliases: "auto read threshold 閾値 タイミング",
    selector: '[data-setting-id="auto-read-threshold"]',
  },
  {
    id: "gallery-columns",
    category: "gallery",
    label: "ギャラリー列数",
    description: "通常時の画像一覧の列数",
    aliases: "gallery columns",
  },
  {
    id: "gallery-focus-columns",
    category: "gallery",
    label: "フォーカス時列数",
    description: "フォーカスモード時のギャラリー列数",
    aliases: "focus columns",
  },
  {
    id: "gallery-card-size",
    category: "gallery",
    label: "カードサイズ",
    description: "画像一覧のカードの大きさ",
    aliases: "gallery card size",
  },
  {
    id: "gallery-min-image",
    category: "gallery",
    label: "最小画像サイズ",
    description: "ギャラリーに表示する画像の最小ピクセル数",
    aliases: "image px 小さい画像",
  },
  {
    id: "gallery-scroll",
    category: "gallery",
    label: "自動スクロール",
    description: "ギャラリーの自動進行・スライドショーの速度",
    aliases: "auto scroll slideshow",
  },
  {
    id: "gallery-page-size",
    category: "gallery",
    label: "1ページの件数",
    description: "一度に表示する記事の件数",
    aliases: "page size pagination ページ 件数",
  },
  {
    id: "tts-engine",
    category: "voice",
    label: "読み上げエンジン",
    description: "対応する環境でブラウザ標準・Piper を選ぶ",
    aliases: "TTS engine Web Speech 音声",
    selector: "#tts-engine-select",
  },
  {
    id: "tts-voice",
    category: "voice",
    label: "読み上げボイス",
    description: "記事ヘッダーで使う音声・言語を選ぶ",
    aliases: "TTS voice 音声 ボイス",
    selector: "#tts-voice-select",
  },
  {
    id: "tts-volume",
    category: "voice",
    label: "読み上げ音量",
    description: "読み上げの音量・ミュート",
    aliases: "TTS volume 音声",
    selector: "#tts-volume-slider",
  },
  {
    id: "ai-provider",
    category: "ai",
    label: "AI の実行先",
    description: "Chrome 内蔵 AI・Workers AI・自動を選ぶ",
    aliases: "provider browser クラウド ローカル",
  },
  {
    id: "auto-translate",
    category: "ai",
    label: "自動翻訳",
    description: "記事を自動で日本語へ翻訳",
    aliases: "auto translate translation",
  },
  {
    id: "auto-summarize",
    category: "ai",
    label: "自動要約",
    description: "記事を自動で要約",
    aliases: "auto summarize summary",
  },
  {
    id: "ai-browser-only",
    category: "ai",
    label: "自動処理は端末のみ",
    description: "実行先が自動のとき、Chrome AI が使えない自動処理を省略",
    aliases: "browser only fallback フォールバック",
  },
  {
    id: "ai-model",
    category: "ai",
    label: "Workers AI モデル",
    description: "クラウドで要約・翻訳するときのモデル",
    aliases: "model Llama モデル",
  },
  {
    id: "recommendation-enabled",
    category: "notifications",
    label: "おすすめ記事通知",
    description: "未読のおすすめを1日1回 Push 通知",
    aliases: "push recommendation",
  },
  {
    id: "recommendation-time",
    category: "notifications",
    label: "配信時刻（目安）",
    description: "おすすめ記事通知の配信時刻を30分刻みで選ぶ",
    aliases: "push time 通知 時間",
  },
  {
    id: "feed-error-notification",
    category: "notifications",
    label: "フィードエラー通知",
    description: "5回連続の取得失敗を Push 通知",
    aliases: "push error",
  },
  {
    id: "silent-start",
    category: "notifications",
    label: "開始時刻",
    description: "Push 通知のサイレント時間帯の開始",
    aliases: "silent hours 通知 おやすみ",
  },
  {
    id: "silent-end",
    category: "notifications",
    label: "終了時刻",
    description: "Push 通知のサイレント時間帯の終了",
    aliases: "silent hours 通知 おやすみ",
  },
  {
    id: "push-timezone",
    category: "notifications",
    label: "タイムゾーン",
    description: "Push 通知の時間帯の基準",
    aliases: "push timezone 時差",
  },
  {
    id: "feed-health",
    category: "feeds",
    label: "フィードの健全性",
    description: "登録フィード数と取得状況を確認",
    aliases: "feed health 登録数 エラー",
    selector: '[data-setting-id="feed-health"]',
  },
  {
    id: "retention",
    category: "storage",
    label: "記事保持期間",
    description: "記事を保持する日数・無制限",
    aliases: "TTL retention 保存 日数",
  },
  {
    id: "deduplicate",
    category: "storage",
    label: "重複記事の非表示",
    description: "複数フィードの同じ URL の記事を1件にまとめる",
    aliases: "dedup deduplication 重複 排除",
  },
  {
    id: "image-folder",
    category: "storage",
    label: "画像保存フォルダー",
    description: "画像ダウンロードの保存先フォルダ名",
    aliases: "download folder image DL",
  },
  {
    id: "nsfw-image-folder",
    category: "storage",
    label: "画像DL先(NSFW)",
    description: "NSFW 画像の保存先フォルダ名",
    aliases: "download folder NSFW",
  },
  {
    id: "share-targets",
    category: "storage",
    label: "シェア先",
    description: "記事ヘッダーに表示するシェア先",
    aliases: "share 共有 SNS",
    selector: '[data-setting-id="share-targets"]',
  },
  {
    id: "opml",
    category: "import-export",
    label: "OPML 入出力",
    description: "購読フィードのインポート・エクスポート",
    aliases: "OPML backup 移行",
    selector: '[data-setting-id="opml"]',
  },
  {
    id: "saved-searches",
    category: "import-export",
    label: "保存済み検索条件",
    description: "検索条件を JSON 保存・取込",
    aliases: "JSON saved search backup",
    selector: '[data-setting-id="saved-searches"]',
  },
  {
    id: "notes-import",
    category: "import-export",
    label: "メモの復元",
    description: "記事 URL が一致するメモを JSON から取込",
    aliases: "JSON notes import バックアップ",
    selector: '[data-setting-id="notes-import"]',
  },
  {
    id: "article-state-import",
    category: "import-export",
    label: "記事状態の復元",
    description: "ブックマーク・後で読むを JSON から取込",
    aliases: "JSON bookmark reading list import",
    selector: '[data-setting-id="article-state-import"]',
  },
  {
    id: "collections-import",
    category: "import-export",
    label: "コレクションの復元",
    description: "コレクション JSON を取り込み先へ追加",
    aliases: "JSON collection import",
    selector: '[data-setting-id="collections-import"]',
  },
  {
    id: "singlefile",
    category: "import-export",
    label: "SingleFile 連携",
    description: "ページ保存の連携先・保存専用トークンの管理",
    aliases: "clip token HTML トークン",
    selector: '[aria-label="SingleFile 連携設定"]',
  },
];
export function normalizeSettingsQuery(query: string): string {
  return query.normalize("NFKC").toLocaleLowerCase("ja").trim();
}
export function searchSettings(query: string): readonly SettingDestination[] {
  const terms = normalizeSettingsQuery(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return SETTINGS_CATALOG.filter((setting) => {
    const category = SETTINGS_CATEGORIES.find((item) => item.id === setting.category)!;
    const text = normalizeSettingsQuery(
      `${setting.label} ${setting.description} ${setting.aliases} ${category.label}`,
    );
    return terms.every((term) => text.includes(term));
  });
}
export function settingIdForLabel(label: string): string | undefined {
  return SETTINGS_CATALOG.find((setting) => setting.label === label)?.id;
}
