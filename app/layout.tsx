import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "食のみやこ熊本券 店舗マップ",
  description: "食のみやこ熊本券を利用できる熊本県内の店舗を、地図・現在地・店名・地域から探せます。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
