import { test, expect } from "@playwright/test";
import {
  resolveRSSHubUrl,
  getRSSHubInstance,
  getRSSHubAccessKey,
  DEFAULT_RSSHUB_INSTANCE,
} from "../src/lib/rsshub";

/**
 * RSSHub URL 変換ロジックのユニットテスト。
 *
 * ネットワークアクセスは発生しない純粋関数のため dev サーバー不要。
 */

test.describe("resolveRSSHubUrl — 対応サービスの変換", () => {
  test("Twitter ユーザー URL を RSSHub URL に変換する", () => {
    const result = resolveRSSHubUrl("https://twitter.com/elonmusk");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/twitter/user/elonmusk");
    expect(result?.service).toBe("Twitter");
  });

  test("x.com (Twitter 新ドメイン) も変換する", () => {
    const result = resolveRSSHubUrl("https://x.com/elonmusk");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/twitter/user/elonmusk");
  });

  test("末尾スラッシュありでも変換する", () => {
    const result = resolveRSSHubUrl("https://twitter.com/elonmusk/");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/twitter/user/elonmusk");
  });

  test("YouTube チャンネル (UC...) を変換する", () => {
    const result = resolveRSSHubUrl("https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/youtube/channel/UCBR8-60-B28hp2BmDPdntcQ");
  });

  test("YouTube @handle を変換する", () => {
    const result = resolveRSSHubUrl("https://www.youtube.com/@YouTube");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/youtube/@YouTube");
  });

  test("GitHub ユーザーの全アクティビティを変換する", () => {
    const result = resolveRSSHubUrl("https://github.com/torvalds");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/github/user/torvalds");
  });

  test("GitHub リポジトリのリリースを変換する", () => {
    const result = resolveRSSHubUrl("https://github.com/vercel/next.js/releases");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/github/release/vercel/next.js");
  });

  test("GitHub リポジトリの issue を変換する", () => {
    const result = resolveRSSHubUrl("https://github.com/vercel/next.js/issues");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/github/issue/vercel/next.js");
  });

  test("Reddit サブレディットを変換する", () => {
    const result = resolveRSSHubUrl("https://www.reddit.com/r/programming");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/reddit/r/programming");
  });

  test("Instagram ユーザーを変換する", () => {
    const result = resolveRSSHubUrl("https://www.instagram.com/nasa");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/instagram/user/nasa");
  });

  test("Pixiv ユーザー (数値 ID) を変換する", () => {
    const result = resolveRSSHubUrl("https://www.pixiv.net/users/12345");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/pixiv/user/12345");
  });

  test("Telegram チャネルを変換する", () => {
    const result = resolveRSSHubUrl("https://t.me/durov");
    expect(result?.rsshubUrl).toBe("https://rsshub.app/telegram/channel/durov");
  });
});

test.describe("resolveRSSHubUrl — 非対応 URL の扱い", () => {
  test("未対応の一般サイトは null を返す", () => {
    expect(resolveRSSHubUrl("https://example.com")).toBeNull();
  });

  test("空文字は null を返す", () => {
    expect(resolveRSSHubUrl("")).toBeNull();
  });

  test("GitHub ユーザーのサブページは user ルートにマッチしない", () => {
    // github.com/user/repo は user 単体ではないので null
    const result = resolveRSSHubUrl("https://github.com/torvalds/linux");
    expect(result).toBeNull();
  });

  test("Twitter のサブページ (/status/...) は変換しない", () => {
    const result = resolveRSSHubUrl("https://twitter.com/elonmusk/status/1234567890");
    expect(result).toBeNull();
  });

  test("YouTube watch URL は変換しない", () => {
    const result = resolveRSSHubUrl("https://www.youtube.com/watch?v=abc");
    expect(result).toBeNull();
  });

  test("GitHub 予約語 marketplace は user ルートに変換しない", () => {
    expect(resolveRSSHubUrl("https://github.com/marketplace")).toBeNull();
  });

  test("GitHub 予約語 topics / features / pricing も変換しない", () => {
    expect(resolveRSSHubUrl("https://github.com/topics")).toBeNull();
    expect(resolveRSSHubUrl("https://github.com/features")).toBeNull();
    expect(resolveRSSHubUrl("https://github.com/pricing")).toBeNull();
  });

  test("GitHub 予約語は大文字小文字を問わず弾く", () => {
    expect(resolveRSSHubUrl("https://github.com/Marketplace")).toBeNull();
    expect(resolveRSSHubUrl("https://github.com/ENTERPRISE")).toBeNull();
  });

  test("Twitter のクエリパラメータ付き URL は変換しない", () => {
    expect(resolveRSSHubUrl("https://twitter.com/elonmusk?lang=ja")).toBeNull();
  });

  test("Reddit サブレディットのサブパスは変換しない", () => {
    expect(resolveRSSHubUrl("https://reddit.com/r/programming/hot")).toBeNull();
  });
});

test.describe("resolveRSSHubUrl — カスタムインスタンス", () => {
  test("カスタムインスタンス URL を使用できる", () => {
    const result = resolveRSSHubUrl(
      "https://twitter.com/elonmusk",
      "https://my-rsshub.example.com",
    );
    expect(result?.rsshubUrl).toBe("https://my-rsshub.example.com/twitter/user/elonmusk");
  });

  test("インスタンス URL の末尾スラッシュは除去される", () => {
    const result = resolveRSSHubUrl(
      "https://twitter.com/elonmusk",
      "https://my-rsshub.example.com/",
    );
    expect(result?.rsshubUrl).toBe("https://my-rsshub.example.com/twitter/user/elonmusk");
  });
});

test.describe("resolveRSSHubUrl — ACCESS_KEY 付与", () => {
  test("access key 指定時は ?key=... を付与する", () => {
    const result = resolveRSSHubUrl(
      "https://twitter.com/elonmusk",
      "https://my-rsshub.example.com",
      "secret-key-123",
    );
    expect(result?.rsshubUrl).toBe(
      "https://my-rsshub.example.com/twitter/user/elonmusk?key=secret-key-123",
    );
  });

  test("access key が空文字 / 空白のみなら付与しない", () => {
    expect(
      resolveRSSHubUrl("https://twitter.com/elonmusk", DEFAULT_RSSHUB_INSTANCE, "")?.rsshubUrl,
    ).toBe("https://rsshub.app/twitter/user/elonmusk");
    expect(
      resolveRSSHubUrl("https://twitter.com/elonmusk", DEFAULT_RSSHUB_INSTANCE, "   ")?.rsshubUrl,
    ).toBe("https://rsshub.app/twitter/user/elonmusk");
  });

  test("access key の特殊文字は URL エンコードされる", () => {
    const result = resolveRSSHubUrl(
      "https://twitter.com/elonmusk",
      DEFAULT_RSSHUB_INSTANCE,
      "key with space & symbol=1",
    );
    expect(result?.rsshubUrl).toBe(
      "https://rsshub.app/twitter/user/elonmusk?key=key%20with%20space%20%26%20symbol%3D1",
    );
  });
});

test.describe("getRSSHubAccessKey", () => {
  test("環境変数未設定時は undefined を返す", () => {
    const prev = process.env.RSSHUB_ACCESS_KEY;
    delete process.env.RSSHUB_ACCESS_KEY;
    try {
      expect(getRSSHubAccessKey()).toBeUndefined();
    } finally {
      if (prev !== undefined) process.env.RSSHUB_ACCESS_KEY = prev;
    }
  });

  test("空文字は undefined 扱い", () => {
    const prev = process.env.RSSHUB_ACCESS_KEY;
    process.env.RSSHUB_ACCESS_KEY = "  ";
    try {
      expect(getRSSHubAccessKey()).toBeUndefined();
    } finally {
      if (prev !== undefined) process.env.RSSHUB_ACCESS_KEY = prev;
      else delete process.env.RSSHUB_ACCESS_KEY;
    }
  });

  test("設定されていればトリム済み文字列を返す", () => {
    const prev = process.env.RSSHUB_ACCESS_KEY;
    process.env.RSSHUB_ACCESS_KEY = "  my-secret-key  ";
    try {
      expect(getRSSHubAccessKey()).toBe("my-secret-key");
    } finally {
      if (prev !== undefined) process.env.RSSHUB_ACCESS_KEY = prev;
      else delete process.env.RSSHUB_ACCESS_KEY;
    }
  });
});

test.describe("getRSSHubInstance", () => {
  test("環境変数未設定時はデフォルトを返す", () => {
    const prev = process.env.RSSHUB_INSTANCE_URL;
    delete process.env.RSSHUB_INSTANCE_URL;
    try {
      expect(getRSSHubInstance()).toBe(DEFAULT_RSSHUB_INSTANCE);
    } finally {
      if (prev !== undefined) process.env.RSSHUB_INSTANCE_URL = prev;
    }
  });

  test("不正な URL はデフォルトにフォールバックする", () => {
    const prev = process.env.RSSHUB_INSTANCE_URL;
    process.env.RSSHUB_INSTANCE_URL = "not-a-url";
    try {
      expect(getRSSHubInstance()).toBe(DEFAULT_RSSHUB_INSTANCE);
    } finally {
      if (prev !== undefined) process.env.RSSHUB_INSTANCE_URL = prev;
      else delete process.env.RSSHUB_INSTANCE_URL;
    }
  });

  test("有効な URL の末尾スラッシュは除去される", () => {
    const prev = process.env.RSSHUB_INSTANCE_URL;
    process.env.RSSHUB_INSTANCE_URL = "https://rsshub.example.com/";
    try {
      expect(getRSSHubInstance()).toBe("https://rsshub.example.com");
    } finally {
      if (prev !== undefined) process.env.RSSHUB_INSTANCE_URL = prev;
      else delete process.env.RSSHUB_INSTANCE_URL;
    }
  });
});
