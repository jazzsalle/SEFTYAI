"use client";
/**
 * 브리핑 설정 — 이제 창(개발서버 BriefingSettingsModal, R53). 옛 주소(/settings/briefing·도움말 화면 이름)로 오면 통합 탐색으로 옮기고 창을 연다
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { openBriefingSettings } from "@/components/briefing/BriefingSettingsModal";

export default function BriefingSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/explore");
    // 창은 AppShell(레이아웃)에 살아 있어 주소가 바뀌어도 닫히지 않는다
    window.setTimeout(openBriefingSettings, 0);
  }, [router]);
  return null;
}
