"use client";
/**
 * 내 브리핑 항목 (계정별 · 서버 저장 D39, scope acct:계정 · key brief) — UFR-006-001-05
 *  · 기본 질문 4개 · 최대 8개 · '사용' 체크한 항목 = 내 브리핑 세트 (4개 이상 체크해야 저장)
 *  · AI 모드 전광판 「브리핑 질문」 = 체크한 항목을 위에서부터 4개
 *  · 시작 화면 「브리핑 질문」     = 체크한 항목에서 접속할 때마다 무작위 4개
 */
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { api } from "./api";

export interface BriefItem { key: string; label: string; q: string; on: boolean; /** 기본 질의문 그대로일 때만 쓰는 의도 고정 키 */ preset?: string }
export const BRIEF_MAX = 8;
export const BRIEF_MIN = 4;
export const BRIEF_AIM_COUNT = 4;
export const BRIEF_START_COUNT = 4;

/** 기본 질문 4개 — 어디가 위험한가 → 실제 피해 이력 → 통제·대피 → 행동매뉴얼 할 일 (조건은 QueryContext로 함께 전달) */
export const BRIEF_DEFAULT: BriefItem[] = [
  { key: "risk", preset: "risk", label: "위험·취약지역", q: "우리 지역에서 먼저 점검해야 할 위험·취약지역은 어디인가요?", on: true },
  { key: "history", preset: "similar", label: "과거 피해 이력", q: "위험·취약지역 중 과거 재난 때 실제로 피해가 났던 곳과 피해 내용은?", on: true },
  { key: "control", label: "통제·대피 대상", q: "통제하거나 주민 대피가 필요할 수 있는 도로·지하차도·인명피해 우려지역은?", on: true },
  { key: "manual", preset: "manual", label: "행동매뉴얼 대응절차", q: "현장조치 행동매뉴얼상 지금 단계에서 해야 할 일과 담당 부서는?", on: true },
];
/** 기본 항목인지 (되돌리기 때 직접 추가한 항목은 지움) */
export const isDefaultItem = (it: BriefItem) => BRIEF_DEFAULT.some((d) => d.key === it.key);

const keyOf = (accountId?: string) => `sa.brief.v3.${accountId ?? "-"}`;
const EVT = "sa:brief";
/** 서버에서 읽기 — 저장한 적 없으면 기본 4개. 이 브라우저에 예전 설정이 있으면 처음 한 번 서버로 옮기고 지움 */
export async function loadBrief(accountId?: string): Promise<BriefItem[]> {
  if (!accountId) return BRIEF_DEFAULT;
  try {
    const kv = await api<Record<string, { value: BriefItem[] }>>(`/api/kv?scope=acct:${accountId}`);
    const l = kv.brief?.value;
    if (Array.isArray(l) && l.length) return l;
    const old = (() => { try { return JSON.parse(localStorage.getItem(keyOf(accountId)) || "null") as BriefItem[] | null; } catch { return null; } })();
    if (Array.isArray(old) && old.length) {
      await saveBrief(accountId, old);
      try { localStorage.removeItem(keyOf(accountId)); } catch {}
      return old;
    }
  } catch {}
  return BRIEF_DEFAULT;
}
export async function saveBrief(accountId: string | undefined, items: BriefItem[]) {
  if (!accountId) return;
  await api("/api/kv", { method: "PUT", json: { scope: `acct:${accountId}`, key: "brief", value: items } });
  window.dispatchEvent(new Event(EVT));
}
const usable = (l: BriefItem[]) => l.filter((x) => x.on && x.q.trim());

/** 체크한 브리핑 항목 (순서 유지) */
export function useBriefItems(): BriefItem[] {
  const { account } = useSession();
  const [items, setItems] = useState<BriefItem[]>(usable(BRIEF_DEFAULT));
  useEffect(() => {
    let alive = true;
    const load = () => loadBrief(account?.id).then((l) => alive && setItems(usable(l)));
    load();
    window.addEventListener(EVT, load);
    return () => {
      alive = false;
      window.removeEventListener(EVT, load);
    };
  }, [account?.id]);
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
