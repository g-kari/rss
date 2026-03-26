import type { Metadata, Viewport } from "next";
import { Reddit_Sans, IBM_Plex_Sans_JP } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" translate="no" className={`${redditSans.variable} ${ibmPlexSansJP.variable}`}>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
