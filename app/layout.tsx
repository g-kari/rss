import type { Metadata, Viewport } from "next";
import { Reddit_Sans, IBM_Plex_Sans_JP } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const redditSans = Reddit_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--loaded-reddit-sans",
});

const ibmPlexSansJP = IBM_Plex_Sans_JP({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--loaded-ibm-plex-sans-jp",
});

export const metadata: Metadata = {
  title: "RSS Reader",
  description: "シンプルな RSS リーダー — AI 要約・翻訳対応",
  manifest: "/manifest.json",
  metadataBase: new URL("https://rss.0g0.xyz"),
  openGraph: {
    title: "RSS Reader",
    description: "シンプルな RSS リーダー — AI 要約・翻訳対応",
    url: "https://rss.0g0.xyz",
    siteName: "RSS Reader",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "RSS Reader — Simple. Fast. Minimal.",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RSS Reader",
    description: "シンプルな RSS リーダー — AI 要約・翻訳対応",
    images: ["/og.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RSS",
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" translate="no" className={`${redditSans.variable} ${ibmPlexSansJP.variable}`}>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
