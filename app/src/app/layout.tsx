import type { Metadata } from "next";
import "ol/ol.css";
// KRDS 공식 React 컴포넌트(@une-front/krds — 개발서버 main.tsx, R64). 우리 루트 글자는 16px 이라 portable 번들(10px 단위)로 개발서버와 같은 크기
import "@une-front/krds/portable/css";
import "@/components/krds/krds.css";
import "./globals.css";
import "./renewal.css";
import { SessionProvider } from "@/lib/session";
import HelpCenter from "@/components/HelpCenter";
import { FontBoot } from "@/components/FontSize";
import { ToastHost } from "@/components/krds/Toast";

export const metadata: Metadata = {
  title: "재난안전 AI 시범서비스 | 행정안전부",
  description: "재난안전 AI 데이터 기반 의사결정 지원 시범서비스 (부산광역시 · 영천시 · 인제군)",
  // 검색 로봇 차단(FUN-UFR-908003, 개발서버 index.html meta robots — R61). public/robots.txt 와 함께 건다
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <FontBoot />
        {/* 토스트는 화면 아래 가운데(개발서버 main.tsx ToastProvider position="bottom-center") */}
        <ToastHost>
          <SessionProvider>
            {children}
            <HelpCenter />
          </SessionProvider>
        </ToastHost>
      </body>
    </html>
  );
}
