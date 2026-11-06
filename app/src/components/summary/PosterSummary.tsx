"use client";
import type { RefLike } from "@/lib/mapRef";
import { GroupBlocks } from "./Blocks";
import { ConditionLine, CountChips, TableView, WhereLine } from "./SummaryParts";
import { useDistrictNames, useSummary } from "./useSummary";
import "./summary.css";

/** 「한눈 요약」 탭이 그릴 답 — 지도에 올린 턴의 답(explore page 의 summary) */
export interface SummarySource {
  jobId: string;
  refs: RefLike[];
  regionName?: string | null;
  basisAt: string;
}

/**
 * 개발 서버 시안 2 — 우측 패널 「한눈 요약」 탭. 구분 색 바탕의 큰 블록.
 * 값과 순서는 대화창 카드(CompactSummary)와 같고 얼굴만 크다. 출처 줄은 개발 서버처럼 내지 않는다
 */
export default function PosterSummary({ source, onEntity }: { source: SummarySource | null; onEntity: (ref: RefLike) => void }) {
  const state = useSummary(source?.refs);
  const names = useDistrictNames(state.kind === "ok" ? state.summary : null);

  if (source && !source.refs.length) {
    return <div className="sm-poster sm-poster--empty"><p>이 답에는 한눈 요약으로 묶을 대상이 없습니다. 답 본문과 지도를 확인하세요.</p></div>;
  }
  if (!source || state.kind === "none") {
    return <div className="sm-poster sm-poster--empty"><p>질문에 답이 오면 그 답의 대상이 여기에 한눈 요약으로 나옵니다.</p></div>;
  }
  if (state.kind === "loading") {
    return <div className="sm-poster sm-poster--empty" aria-busy="true"><p>한눈 요약을 만드는 중…</p></div>;
  }
  const { summary } = state;
  return (
    <div className="sm-poster">
      <header className="sm-poster-head">
        <h3 className="sm-poster-title">답변 한눈 요약</h3>
        <ConditionLine summary={summary} regionName={source.regionName} basisAt={source.basisAt} />
        <CountChips summary={summary} />
      </header>
      <div className="sm-poster-grid">
        {summary.groups.map((g) => (
          <div key={g.key} className="sm-group sm-group--poster">
            <GroupBlocks group={g} variant="poster" basisAt={source.basisAt} />
            <WhereLine group={g} names={names} />
          </div>
        ))}
      </div>
      <TableView summary={summary} onEntity={onEntity} />
    </div>
  );
}
