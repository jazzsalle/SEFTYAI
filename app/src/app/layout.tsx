import type { Metadata } from "next";
import "ol/ol.css";
import "./globals.css";
import "./renewal.css";
import { SessionProvider } from "@/lib/session";
import HelpCenter from "@/components/HelpCenter";

export const metadata: Metadata = {
  title: "재난안전 AI 시범서비스 | 행정안전부",
  description: "재난안전 AI 데이터 기반 의사결정 지원 시범서비스 (부산광역시 · 영천시 · 인제군)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <SessionProvider>
          {children}
          <HelpCenter />
        </SessionProvider>
      </body>
    </html>
  );
}
