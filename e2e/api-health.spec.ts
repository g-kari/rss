import { test, expect } from '@playwright/test';

/**
 * API エンドポイントの基本動作確認
 * 認証不要なエンドポイントのみ対象
 */
test.describe('API ヘルスチェック', () => {
  test('GET /api/health が 200 を返す', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test('GET /api/auth/me が未認証時に user: null を返す', async ({ request }) => {
    // /api/auth/me は未認証でも 200 + { user: null } を返す仕様
    const res = await request.get('/api/auth/me');
    expect(res.status()).toBe(200);
    const body = await res.json() as { user: null };
    expect(body.user).toBeNull();
  });

  test('GET /api/feeds が未認証時に 401 を返す', async ({ request }) => {
    const res = await request.get('/api/feeds');
    expect(res.status()).toBe(401);
  });

  test('GET /api/articles が未認証時に 401 を返す', async ({ request }) => {
    const res = await request.get('/api/articles');
    expect(res.status()).toBe(401);
  });

  test('GET /api/content が未認証時に 401 を返す', async ({ request }) => {
    const res = await request.get('/api/content?url=https://example.com');
    expect(res.status()).toBe(401);
  });
});
