"use client";
import { createContext, useContext } from "react";
import type { Citation } from "@/lib/contract/agent";
import type { T3qRef } from "@/lib/jobTypes";

export type TabKind = "map" | "sop" | "doc" | "detail";
export interface PanelTab {
  key: string;
  kind: TabKind;
  title: string;
  /** 닫을 수 없는 고정 탭 (지자체 계정의 「대응절차」) */
  pinned?: boolean;
  citation?: Citation;
  /** T3Q Data API 상세 (T3Q-10·15·16·17 등) — ID 는 T3Q 가 준 값 그대로 */
  detail?: { api: string; id: string; label: string; ctx?: Record<string, unknown> | null };
}

export interface ExploreApi {
  openCitation: (c: Citation) => void;
  /** ctx = 비교 조건(유사사례 목록의 query_context) — 사건 상세에서 유사도 근거(T3Q-11) 조회에 씀 */
  openDetail: (api: string, id: string, label: string, ctx?: Record<string, unknown> | null) => void;
  /** 답의 대상(refs)을 지도에 — ref 를 주면 그 대상 선택 */
  showOnMap: (jobId: string, ref?: string) => void;
  selectedKey: string | null;
  /** 이어서 묻기 — 고른 참조 대상과 함께 */
  followUp: (jobId: string, refs: T3qRef[]) => void;
  /** 실패·유실·시간 초과한 답 다시 질의 — 같은 요청(문맥 포함)으로 */
  retry: (jobId: string) => void;
}

export const ExploreContext = createContext<ExploreApi | null>(null);
export const useExplore = () => {
  const v = useContext(ExploreContext);
  if (!v) throw new Error("ExploreContext 누락");
  return v;
};
