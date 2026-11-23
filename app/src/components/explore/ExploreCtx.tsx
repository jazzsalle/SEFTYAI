"use client";
import { createContext, useContext } from "react";
import type { Citation } from "@/lib/contract/agent";
import type { RefLike } from "@/lib/mapRef";
import type { DocRow } from "@/lib/docRefs";

export type TabKind = "map" | "summary" | "sop" | "doc" | "detail" | "evidence";
export interface PanelTab {
  key: string;
  kind: TabKind;
  title: string;
  /** 닫을 수 없는 고정 탭 (지자체 계정의 「대응절차」) */
  pinned?: boolean;
  citation?: Citation;
  /** T3Q Data API 상세 (T3Q-10·15·16·17 등) — ID 는 T3Q 가 준 값 그대로 */
  detail?: { api: string; id: string; label: string; ctx?: Record<string, unknown> | null; entityType?: string | null };
  /** 답의 근거 문서 쪽(T3Q 쪽 본문 API) — 탭은 하나, 다른 근거를 누르면 내용만 바뀐다 */
  evidence?: { jobId: string; row: DocRow; rows: DocRow[]; view?: string };
}

export interface ExploreApi {
  openCitation: (c: Citation) => void;
  /** ctx = 비교 조건(유사사례 목록의 query_context) — 사건 상세에서 유사도 근거(T3Q-11) 조회에 씀 */
  openDetail: (api: string, id: string, label: string, ctx?: Record<string, unknown> | null) => void;
  /** 답의 대상(refs)을 지도에 — ref 를 주면 그 대상 선택 */
  showOnMap: (jobId: string, ref?: string) => void;
  /**
   * 답 속 이름·대상 목록·한눈 요약의 이름을 누름 — 개발서버 usePanel.openEntity 그대로:
   * 대상 상세 탭(T3Q-15)을 만들되 보이는 것은 지도(그 대상으로 옮겨 감). 같은 대상이면 탭을 새로 만들지 않는다
   */
  openEntity: (jobId: string, ref: RefLike) => void;
  /** 지도에서 대상을 누름 — 고른 표시만(지도 맞춤 없음). key = `${jobId}:${ref}` */
  selectOnMap: (key: string) => void;
  /** 답의 근거 표지·「근거 문서」 줄·문서 속 그림을 누름 — 우측 「근거 문서」 탭에 그 쪽(view = 「figure:f1」 이면 그 그림부터) */
  openEvidence: (jobId: string, row: DocRow, rows: DocRow[], view?: string) => void;
  /** 지금 「근거 문서」 탭에 열려 있는 근거 */
  activeEvidence: { jobId: string; doc: string } | null;
  /** 「한눈 요약」 탭에서 이 답을 크게(답 카드 [패널에서 크게 보기]) */
  showSummary: (jobId: string) => void;
  selectedKey: string | null;
  /** 실패·유실·시간 초과한 답 다시 질의 — 같은 요청(문맥 포함)으로 */
  retry: (jobId: string) => void;
  /** 「이어서 물어보기」 추천 후속질문을 누름 — 그 글 그대로 이 대화에 이어 묻는다(개발서버 AnswerPanel onFollowUp · FUN-UFR-301003). 없으면 추천 후속질문을 보이지 않는다 */
  askSuggested?: (text: string) => void;
}

export const ExploreContext = createContext<ExploreApi | null>(null);
export const useExplore = () => {
  const v = useContext(ExploreContext);
  if (!v) throw new Error("ExploreContext 누락");
  return v;
};
