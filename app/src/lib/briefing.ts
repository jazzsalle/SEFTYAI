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
import { DEFAULT_BRIEFING, libById } from "./library";

export interface BriefItem { key: string; label: string; q: string; on: boolean; /** 기본 질의문 그대로일 때만 쓰는 의도 고정 키 */ preset?: string }
export const BRIEF_MAX = 8;
export const BRIEF_MIN = 4;
export const BRIEF_AIM_COUNT = 4;
export const BRIEF_START_COUNT = 4;

/** 기본 질문 4개 — 질문 라이브러리 BR-01~04 ({지역} = 기준지역 이름). 질의문을 고치지 않았을 때만 자동 조회 데이터(preset = 라이브러리 id)를 함께 부른다 */
export const BRIEF_DEFAULT: BriefItem[] = DEFAULT_BRIEFING.map((id) => {
  const q = libById(id)!;
  return { key: id, preset: id, label: q.category, q: q.text, on: true };
});
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

/**
 * 체크한 브리핑 항목 (순서 유지) + 이 계정 값을 서버에서 다 읽었는지(loaded).
 * 읽기 전에는 기본 4문항이 보인다 — 곧바로 보내는 경로(explore ?brief=1)는 loaded 를 기다린다(기본 항목이 잘못 나가지 않게)
 */
export function useBriefState(): { items: BriefItem[]; loaded: boolean } {
  const { account } = useSession();
  const [st, setSt] = useState<{ acct: string | undefined | null; items: BriefItem[] }>({ acct: null, items: usable(BRIEF_DEFAULT) });
  useEffect(() => {
    let alive = true;
    const acct = account?.id;
    const load = () => loadBrief(acct).then((l) => alive && setSt({ acct, items: usable(l) }));
    load();
    window.addEventListener(EVT, load);
    return () => {
      alive = false;
      window.removeEventListener(EVT, load);
    };
  }, [account?.id]);
  return { items: st.items, loaded: st.acct === account?.id };
}
export const useBriefItems = (): BriefItem[] => useBriefState().items;

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
