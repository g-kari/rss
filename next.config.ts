import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cloudflare Workers ではサーバーサイド機能を edge runtime で動かす
  // API routes は各 route.ts で指定
};

export default nextConfig;
