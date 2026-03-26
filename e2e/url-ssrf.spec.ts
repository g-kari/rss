import { test, expect } from "@playwright/test";
import { isValidFeedUrl, isValidHttpsUrl } from "../src/lib/url";

/**
 * isValidFeedUrl の SSRF 対策回帰テスト
 *
 * プライベート IP・ループバック・特殊 IPv6 アドレスへのアクセスを
 * 拒否することを検証する。WHATWG URL パーサーの正規化に依存しているため、
 * バイパス手法（10進数・16進数・8進数表記）も含めて検証する。
 */

test.describe("isValidFeedUrl — 有効な URL", () => {
  test("https の公開 URL を許可する", () => {
    expect(isValidFeedUrl("https://example.com/feed")).toBe(true);
  });

  test("http の公開 URL を許可する", () => {
    expect(isValidFeedUrl("http://feeds.example.com/rss")).toBe(true);
  });

  test("サブドメイン付き URL を許可する", () => {
    expect(isValidFeedUrl("https://blog.example.co.jp/feed.xml")).toBe(true);
  });

  test("ポート番号付き URL を許可する", () => {
    expect(isValidFeedUrl("http://example.com:8080/rss")).toBe(true);
  });
});

test.describe("isValidFeedUrl — 非 http/https スキームを拒否", () => {
  test("file:// を拒否する", () => {
    expect(isValidFeedUrl("file:///etc/passwd")).toBe(false);
  });

  test("ftp:// を拒否する", () => {
    expect(isValidFeedUrl("ftp://example.com/feed")).toBe(false);
  });

  test("javascript: を拒否する", () => {
    expect(isValidFeedUrl("javascript:alert(1)")).toBe(false);
  });

  test("data: URI を拒否する", () => {
    expect(isValidFeedUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  test("空文字列を拒否する", () => {
    expect(isValidFeedUrl("")).toBe(false);
  });

  test("不正な URL を拒否する", () => {
    expect(isValidFeedUrl("not-a-url")).toBe(false);
  });
});

test.describe("isValidFeedUrl — IPv4 プライベートアドレスを拒否", () => {
  test("127.0.0.1 ループバックを拒否する", () => {
    expect(isValidFeedUrl("http://127.0.0.1/feed")).toBe(false);
  });

  test("127.255.255.255 ループバックを拒否する", () => {
    expect(isValidFeedUrl("http://127.255.255.255/feed")).toBe(false);
  });

  test("10.0.0.1 プライベートを拒否する", () => {
    expect(isValidFeedUrl("http://10.0.0.1/feed")).toBe(false);
  });

  test("10.255.255.255 プライベートを拒否する", () => {
    expect(isValidFeedUrl("http://10.255.255.255/feed")).toBe(false);
  });

  test("172.16.0.1 プライベートを拒否する", () => {
    expect(isValidFeedUrl("http://172.16.0.1/feed")).toBe(false);
  });

  test("172.31.255.255 プライベートを拒否する", () => {
    expect(isValidFeedUrl("http://172.31.255.255/feed")).toBe(false);
  });

  test("172.15.x.x はプライベート範囲外なので許可する", () => {
    expect(isValidFeedUrl("http://172.15.0.1/feed")).toBe(true);
  });

  test("172.32.x.x はプライベート範囲外なので許可する", () => {
    expect(isValidFeedUrl("http://172.32.0.1/feed")).toBe(true);
  });

  test("192.168.0.1 プライベートを拒否する", () => {
    expect(isValidFeedUrl("http://192.168.0.1/feed")).toBe(false);
  });

  test("192.168.255.255 プライベートを拒否する", () => {
    expect(isValidFeedUrl("http://192.168.255.255/feed")).toBe(false);
  });

  test("169.254.0.1 リンクローカルを拒否する", () => {
    expect(isValidFeedUrl("http://169.254.0.1/feed")).toBe(false);
  });

  test("0.0.0.0 を拒否する", () => {
    expect(isValidFeedUrl("http://0.0.0.0/feed")).toBe(false);
  });

  test("255.0.0.0 ブロードキャストを拒否する", () => {
    expect(isValidFeedUrl("http://255.0.0.0/feed")).toBe(false);
  });

  test("100.64.0.1 CGNAT 開始アドレスを拒否する", () => {
    expect(isValidFeedUrl("http://100.64.0.1/feed")).toBe(false);
  });

  test("100.100.0.1 CGNAT 中間アドレスを拒否する", () => {
    expect(isValidFeedUrl("http://100.100.0.1/feed")).toBe(false);
  });

  test("100.127.255.255 CGNAT 末尾アドレスを拒否する", () => {
    expect(isValidFeedUrl("http://100.127.255.255/feed")).toBe(false);
  });

  test("100.63.x.x は CGNAT 範囲外なので許可する", () => {
    expect(isValidFeedUrl("http://100.63.0.1/feed")).toBe(true);
  });

  test("100.128.x.x は CGNAT 範囲外なので許可する", () => {
    expect(isValidFeedUrl("http://100.128.0.1/feed")).toBe(true);
  });
});

test.describe("isValidFeedUrl — IPv4 バイパス手法（10進数・16進数・8進数）", () => {
  // WHATWG URL パーサーがこれらを正規化することを利用して拒否する

  test("127.0.0.1 の10進表記 (2130706433) を拒否する", () => {
    // WHATWG URL: new URL('http://2130706433/').hostname → '127.0.0.1'
    expect(isValidFeedUrl("http://2130706433/")).toBe(false);
  });

  test("127.0.0.1 の16進表記 (0x7f000001) を拒否する", () => {
    // WHATWG URL: new URL('http://0x7f000001/').hostname → '127.0.0.1'
    expect(isValidFeedUrl("http://0x7f000001/")).toBe(false);
  });

  test("127.0.0.1 の8進数混在表記 (0177.0.0.1) を拒否する", () => {
    // WHATWG URL: new URL('http://0177.0.0.1/').hostname → '127.0.0.1'
    expect(isValidFeedUrl("http://0177.0.0.1/")).toBe(false);
  });

  test("192.168.1.1 の10進表記 (3232235777) を拒否する", () => {
    expect(isValidFeedUrl("http://3232235777/")).toBe(false);
  });

  test("10.0.0.1 の10進表記 (167772161) を拒否する", () => {
    expect(isValidFeedUrl("http://167772161/")).toBe(false);
  });
});

test.describe("isValidFeedUrl — ホスト名ベースのプライベートを拒否", () => {
  test("localhost を拒否する", () => {
    expect(isValidFeedUrl("http://localhost/feed")).toBe(false);
  });

  test("LOCALHOST (大文字) を拒否する", () => {
    expect(isValidFeedUrl("http://LOCALHOST/feed")).toBe(false);
  });

  test(".local ドメインを拒否する", () => {
    expect(isValidFeedUrl("http://myservice.local/feed")).toBe(false);
  });

  test(".internal ドメインを拒否する", () => {
    expect(isValidFeedUrl("http://api.internal/feed")).toBe(false);
  });

  test(".localhost ドメインを拒否する", () => {
    expect(isValidFeedUrl("http://app.localhost/feed")).toBe(false);
  });
});

test.describe("isValidFeedUrl — IPv6 プライベート・特殊アドレスを拒否", () => {
  test("[::1] ループバックを拒否する", () => {
    expect(isValidFeedUrl("http://[::1]/feed")).toBe(false);
  });

  test("[::]（未指定アドレス）を拒否する", () => {
    expect(isValidFeedUrl("http://[::]/feed")).toBe(false);
  });

  test("[fc00::1] ユニークローカルを拒否する", () => {
    expect(isValidFeedUrl("http://[fc00::1]/feed")).toBe(false);
  });

  test("[fd00::1] ユニークローカルを拒否する", () => {
    expect(isValidFeedUrl("http://[fd00::1]/feed")).toBe(false);
  });

  test("[fe80::1] リンクローカルを拒否する", () => {
    expect(isValidFeedUrl("http://[fe80::1]/feed")).toBe(false);
  });

  test("[fe90::1] リンクローカル(fe90)を拒否する", () => {
    expect(isValidFeedUrl("http://[fe90::1]/feed")).toBe(false);
  });

  test("[fea0::1] リンクローカル(fea0)を拒否する", () => {
    expect(isValidFeedUrl("http://[fea0::1]/feed")).toBe(false);
  });

  test("[feb0::1] リンクローカル(feb0)を拒否する", () => {
    expect(isValidFeedUrl("http://[feb0::1]/feed")).toBe(false);
  });
});

test.describe("isValidFeedUrl — IPv4 変換 IPv6 アドレスを拒否", () => {
  test("[::ffff:127.0.0.1] IPv4マップド IPv6 を拒否する", () => {
    // WHATWG URL: [::ffff:127.0.0.1] → [::ffff:7f00:1]
    expect(isValidFeedUrl("http://[::ffff:127.0.0.1]/")).toBe(false);
  });

  test("[::ffff:7f00:1] IPv4マップド IPv6 を拒否する", () => {
    expect(isValidFeedUrl("http://[::ffff:7f00:1]/")).toBe(false);
  });

  test("[::ffff:192.168.1.1] IPv4マップド IPv6 を拒否する", () => {
    expect(isValidFeedUrl("http://[::ffff:192.168.1.1]/")).toBe(false);
  });

  test("[0:0:0:0:0:ffff:127.0.0.1] IPv4マップド IPv6 (完全表記) を拒否する", () => {
    // WHATWG URL: → [::ffff:7f00:1]
    expect(isValidFeedUrl("http://[0:0:0:0:0:ffff:127.0.0.1]/")).toBe(false);
  });

  test("[::7f00:1] IPv4互換 IPv6 (127.0.0.1相当) を拒否する", () => {
    expect(isValidFeedUrl("http://[::7f00:1]/")).toBe(false);
  });

  test("[::c0a8:101] IPv4互換 IPv6 (192.168.1.1相当) を拒否する", () => {
    expect(isValidFeedUrl("http://[::c0a8:101]/")).toBe(false);
  });

  test("[::a00:1] IPv4互換 IPv6 (10.0.0.1相当) を拒否する", () => {
    expect(isValidFeedUrl("http://[::a00:1]/")).toBe(false);
  });

  test("[64:ff9b::7f00:1] NAT64 変換プレフィックスを拒否する", () => {
    expect(isValidFeedUrl("http://[64:ff9b::7f00:1]/")).toBe(false);
  });
});

// =========================================================================
// isValidHttpsUrl — プッシュ通知エンドポイント用 SSRF 対策
// =========================================================================

test.describe("isValidHttpsUrl — 有効な URL", () => {
  test("https の公開 URL を許可する", () => {
    expect(isValidHttpsUrl("https://fcm.googleapis.com/fcm/send/abc123")).toBe(true);
  });

  test("https のサブドメイン URL を許可する", () => {
    expect(isValidHttpsUrl("https://push.services.mozilla.com/wpush/v2/abc")).toBe(true);
  });
});

test.describe("isValidHttpsUrl — http を拒否", () => {
  test("http URL を拒否する（HTTPS のみ許可）", () => {
    expect(isValidHttpsUrl("http://example.com/push")).toBe(false);
  });

  test("空文字列を拒否する", () => {
    expect(isValidHttpsUrl("")).toBe(false);
  });

  test("不正な URL を拒否する", () => {
    expect(isValidHttpsUrl("not-a-url")).toBe(false);
  });
});

test.describe("isValidHttpsUrl — SSRF 対策（プライベート IP を拒否）", () => {
  test("127.0.0.1 ループバックを拒否する", () => {
    expect(isValidHttpsUrl("https://127.0.0.1/push")).toBe(false);
  });

  test("10.0.0.1 プライベートを拒否する", () => {
    expect(isValidHttpsUrl("https://10.0.0.1/push")).toBe(false);
  });

  test("192.168.1.1 プライベートを拒否する", () => {
    expect(isValidHttpsUrl("https://192.168.1.1/push")).toBe(false);
  });

  test("172.16.0.1 プライベートを拒否する", () => {
    expect(isValidHttpsUrl("https://172.16.0.1/push")).toBe(false);
  });

  test("169.254.1.1 リンクローカルを拒否する", () => {
    expect(isValidHttpsUrl("https://169.254.1.1/push")).toBe(false);
  });

  test("localhost を拒否する", () => {
    expect(isValidHttpsUrl("https://localhost/push")).toBe(false);
  });

  test(".internal ドメインを拒否する", () => {
    expect(isValidHttpsUrl("https://api.internal/push")).toBe(false);
  });

  test("[::1] IPv6 ループバックを拒否する", () => {
    expect(isValidHttpsUrl("https://[::1]/push")).toBe(false);
  });

  test("[::ffff:127.0.0.1] IPv4マップド IPv6 を拒否する", () => {
    expect(isValidHttpsUrl("https://[::ffff:127.0.0.1]/push")).toBe(false);
  });

  test("2048 文字超の URL を拒否する", () => {
    const long = "https://example.com/" + "a".repeat(2030);
    expect(isValidHttpsUrl(long)).toBe(false);
  });
});
