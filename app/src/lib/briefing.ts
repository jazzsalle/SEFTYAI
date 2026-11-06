"use client";
/**
 * 내 브리핑 세트 (계정별 · 서버 저장, scope acct:계정 · key briefing) — 규칙·기본 항목은 lib/briefingSet(개발서버와 같게, R51)
 *  · 저장한 적 없으면 기본 항목(개발서버 ai_briefing_item 가운데 사용 중인 것, 기본 항목만 체크)
 *  · 브리핑에 나가는 것 = 체크한 항목 전부, 놓인 순서대로(시작 화면 [브리핑 시작] · 질의 줄 「브리핑 세트」 · AI 모드)
 *  · 시작 화면 타일 = 등록 항목 전부
 */
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { api } from "./api";
import { BRIEFING_KV_KEY, briefingDefaults, briefingFromStored, validateBriefing, type BriefingItem } from "./briefingSet";

export type { BriefingItem } from "./briefingSet";
export { BRIEFING_RULES, briefingDefaults } from "./briefingSet";

const EVT = "sa:brief";
/** 서버에서 읽기 — 저장한 적 없으면 기본 항목 */
export async function loadBriefing(accountId?: string): Promise<BriefingItem[]> {
  if (!accountId) return briefingDefaults();
  try {
    const kv = await api<Record<string, { value: unknown }>>(`/api/kv?scope=acct:${accountId}`);
    return briefingFromStored(kv[BRIEFING_KV_KEY]?.value) ?? briefingDefaults();
  } catch {
    return briefingDefaults();
  }
}
/** 목록을 통째로 바꾼다 — 규칙에 어긋나면 그 까닭을 던진다(서버 api/kv 도 같은 검사) */
export async function saveBriefing(accountId: string | undefined, items: BriefingItem[]) {
  if (!accountId) return;
  await api("/api/kv", { method: "PUT", json: { scope: `acct:${accountId}`, key: BRIEFING_KV_KEY, value: validateBriefing(items) } });
  window.dispatchEvent(new Event(EVT));
}

/**
 * 내 브리핑 세트 — items = 등록 항목 전부, checked = 체크한 항목(놓인 순서) · loaded = 이 계정 값을 서버에서 다 읽었는지.
 * 읽기 전에는 기본 항목이 보인다 — 곧바로 보내는 경로(explore ?brief=1)는 loaded 를 기다린다(기본 항목이 잘못 나가지 않게)
 */
export function useBriefingSet(): { items: BriefingItem[]; checked: BriefingItem[]; loaded: boolean } {
  const { account } = useSession();
  const [st, setSt] = useState<{ acct: string | undefined | null; items: BriefingItem[] }>({ acct: null, items: briefingDefaults() });
  useEffect(() => {
    let alive = true;
    const acct = account?.id;
    const load = () => loadBriefing(acct).then((l) => alive && setSt({ acct, items: l }));
    load();
    window.addEventListener(EVT, load);
    return () => {
      alive = false;
      window.removeEventListener(EVT, load);
    };
  }, [account?.id]);
  return { items: st.items, checked: st.items.filter((x) => x.checked), loaded: st.acct === account?.id };
}
/** 체크한 항목(브리핑에 나가는 목록) */
export const useBriefItems = (): BriefingItem[] => useBriefingSet().checked;
