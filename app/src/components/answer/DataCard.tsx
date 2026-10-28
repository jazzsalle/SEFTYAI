"use client";
import type { PreviewItem } from "@/lib/jobTypes";
import GenericCard from "./cards/GenericCard";
import SimilarEventsCard from "./cards/SimilarEventsCard";

export { cellText } from "./cards/GenericCard";

/**
 * 자동 조회 데이터 (R3) — 정의된 질문과 함께 먼저 부른 재난안전 데이터 조회 원응답. 에이전트 답과 섞지 않는다.
 * 조회마다 카드 하나: 유사재난 사례(SIMILAR_EVENT) → SimilarEventsCard, 그 밖 → GenericCard(표).
 */
export default function DataCard({ items }: { items: PreviewItem[] }) {
  return (
    <div className="datacard">
      <div className="datacard-h">
        <span className="badge neutral">자동 조회 데이터</span>
      </div>
      {items.map((p, i) => (p.api === "SIMILAR_EVENT" ? <SimilarEventsCard key={i} p={p} /> : <GenericCard key={i} p={p} />))}
    </div>
  );
}
