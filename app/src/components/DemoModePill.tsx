"use client";
/**
 * 머리줄 「시연 모드」 알약 — 개발서버 DemoModeButton 과 같은 자리·모양(메뉴 끝, 흐린 회색 알약, 2026-11-19 「개발서버와 동일하게」).
 * 표시: 켜짐 「시연 모드 · H:MM 남음」 / 꺼짐 「시연 모드 꺼짐」. 1분마다 다시 읽는다.
 * 우리는 시연 모드를 운영자만 켜고 끈다(R52) — 운영자가 누르면 운영관리 「시연 모드」 탭으로 가고, 다른 계정에는 표시만 한다.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const left = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")} 남음`;

export default function DemoModePill({ operator }: { operator: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<{ on: boolean; remainingSeconds: number } | null>(null);
  const load = useCallback(() => {
    api<{ on: boolean; remainingSeconds: number }>("/api/demo-mode").then(setView, () => undefined);
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  if (!view) return null;
  const text = view.on ? `시연 모드 · ${left(view.remainingSeconds)}` : "시연 모드 꺼짐";
  const title = view.on ? "시연 모드 — 받아 둔 응답을 바로 보여 줍니다." : "시연 모드 꺼짐 — 응답을 늘 새로 받습니다.";
  if (!operator) return <span className={`demo-mode-btn ${view.on ? "is-on" : ""}`} title={title}>{text}</span>;
  return (
    <button type="button" className={`demo-mode-btn ${view.on ? "is-on" : ""}`} aria-pressed={view.on} title={`${title} 누르면 운영관리에서 켜고 끕니다.`} onClick={() => router.push("/admin?tab=demo")}>
      {text}
    </button>
  );
}
