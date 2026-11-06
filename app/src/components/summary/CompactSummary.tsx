"use client";
import type { RefLike } from "@/lib/mapRef";
import { OPEN_GROUPS } from "@/lib/summary";
import { GroupBlocks } from "./Blocks";
import { ConditionLine, CountChips, TableView, WhereLine } from "./SummaryParts";
import { useDistrictNames, useSummary } from "./useSummary";
import "./summary.css";

/**
 * 개발 서버 시안 1 — 대화창 압축형 카드. 답 글 위에 놓인다.
 * 조건 줄 → 구분별 개수 → 구분별 블록(2열, 앞 3개 펼침) → 표로 보기. 같은 답을 우측 「한눈 요약」 탭이 크게 그린다 — [패널에서 크게 보기]
 */
export default function CompactSummary({ refs, regionName, basisAt, onEntity, onExpand }: {
  refs: RefLike[] | undefined;
  regionName?: string | null;
  basisAt: string;
  onEntity: (ref: RefLike) => void;
  onExpand?: () => void;
}) {
  const state = useSummary(refs);
  const names = useDistrictNames(state.kind === "ok" ? state.summary : null);
  if (state.kind === "none") return null;
  if (state.kind === "loading") {
    return <section className="sm-card sm-card--loading" aria-busy="true"><p className="sm-cond">한눈 요약을 만드는 중…</p></section>;
  }
  const { summary } = state;
  const open = summary.groups.slice(0, OPEN_GROUPS);
  const folded = summary.groups.slice(OPEN_GROUPS);
  return (
    <section className="sm-card" aria-label="답변 한눈 요약">
      <header className="sm-card-head">
        <h3 className="sm-card-title">한눈 요약</h3>
        {onExpand && <button type="button" className="sm-expand" onClick={onExpand}>패널에서 크게 보기</button>}
      </header>
      <ConditionLine summary={summary} regionName={regionName} basisAt={basisAt} />
      <CountChips summary={summary} />
      {open.length > 0 && (
        <div className="sm-grid2">
          {open.map((g) => (
            <div key={g.key} className="sm-group">
              <GroupBlocks group={g} variant="compact" basisAt={basisAt} />
              <WhereLine group={g} names={names} />
            </div>
          ))}
        </div>
      )}
      {folded.map((g) => (
        <details key={g.key} className="sm-fold">
          <summary>{g.short} {g.count}곳</summary>
          {/* 펼친 내용은 칸 폭을 다 쓴다 — 2단 안에 하나만 두면 반 폭 카드가 떠 보인다(개발 서버 지시 41) */}
          <div className="sm-fold-body">
            <div className="sm-group">
              <GroupBlocks group={g} variant="compact" basisAt={basisAt} />
              <WhereLine group={g} names={names} />
            </div>
          </div>
        </details>
      ))}
      <TableView summary={summary} onEntity={onEntity} />
    </section>
  );
}
