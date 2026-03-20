import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RSS Reader',
  description: 'シンプルな RSS リーダー — AI 要約・翻訳対応',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
