"use client";
/**
 * 내 브리핑 항목 (계정별 · 이 브라우저에 저장)
 *  · AI 모드 전광판 「브리핑 질문」 = 사용 중인 항목을 위에서부터 5개
 *  · 시작 화면 「브리핑 질문」     = 사용 중인 항목에서 접속할 때마다 무작위 4개
 */
import { useEffect, useState } from "react";
import { useSession } from "./session";

export interface BriefItem { key: string; label: string; q: string; on: boolean; /** 기본 질의문 그대로일 때만 쓰는 의도 고정 키 */ preset?: string }
export const BRIEF_MAX = 8;
export const BRIEF_AIM_COUNT = 5;
export const BRIEF_START_COUNT = 4;

export const BRIEF_DEFAULT: BriefItem[] = [
  { key: "wx", preset: "wx", label: "현재 기상상황", q: "지금 우리 지역 기상특보와 강우 상황은 어떤가요?", on: true },
  { key: "risk", preset: "risk", label: "위험·취약지역", q: "지금 강우 조건에서 먼저 확인해야 할 위험·취약지역은 어디인가요?", on: true },
  { key: "similar", preset: "similar", label: "과거 유사사례", q: "비슷한 강우 때 과거에 어디서 어떤 피해가 있었나요?", on: true },
  { key: "manual", preset: "manual", label: "행동매뉴얼 대응절차", q: "지금 특보 단계에서 행동매뉴얼상 제가 해야 할 일은 무엇인가요?", on: true },
  { key: "assess", label: "상황 판단", q: "지금 상황에서 비상 몇 단계이고, 대책본부 가동·중앙 보고가 필요한가요?", on: true },
  { key: "control", label: "통제 대상", q: "지금 먼저 통제해야 할 도로와 지하차도는?", on: true },
  { key: "evac", label: "대피 판단", q: "대피가 필요한 지역과 대상 인원은?", on: true },
  { key: "r119", label: "119 신고", q: "이번 호우로 접수된 119 신고 현황은?", on: true },
];

const keyOf = (accountId?: string) => `sa.brief.v2.${accountId ?? "-"}`;
export function loadBrief(accountId?: string): BriefItem[] {
  try {
    const v = localStorage.getItem(keyOf(accountId));
    const l = v ? (JSON.parse(v) as BriefItem[]) : null;
    return Array.isArray(l) && l.length ? l : BRIEF_DEFAULT;
  } catch {
    return BRIEF_DEFAULT;
  }
}
export function saveBrief(accountId: string | undefined, items: BriefItem[]) {
  try { localStorage.setItem(keyOf(accountId), JSON.stringify(items)); } catch {}
}
const usable = (l: BriefItem[]) => l.filter((x) => x.on && x.q.trim());

/** 사용 중인 브리핑 항목 (순서 유지) */
export function useBriefItems(): BriefItem[] {
  const { account } = useSession();
  const [items, setItems] = useState<BriefItem[]>(usable(BRIEF_DEFAULT));
  useEffect(() => setItems(usable(loadBrief(account?.id))), [account?.id]);
  return items;
}

/** 무작위 n개 (접속할 때마다 다르게 — 화면이 열릴 때 한 번 섞음) */
export function useRandomBrief(n: number): BriefItem[] {
  const items = useBriefItems();
  const [pick, setPick] = useState<BriefItem[]>([]);
  useEffect(() => {
    const l = [...items];
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    setPick(l.slice(0, n));
  }, [items, n]);
  return pick;
}
