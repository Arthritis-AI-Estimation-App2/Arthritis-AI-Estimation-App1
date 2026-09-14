import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "関節炎スクリーニング",
    template: "%s | 関節炎スクリーニング",
  },
  description: "手指の撮影による関節炎スクリーニング支援アプリ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const maxDuration = 60;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const darkModeEnabled = process.env.ENABLE_DARK_MODE === "true";

  return (
    <html lang="ja" data-dark-mode-enabled={darkModeEnabled ? "true" : undefined}>
      <body>{children}</body>
    </html>
  );
}
