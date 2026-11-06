"use client";
import type { RefLike } from "@/lib/mapRef";
import { BLOCK_COLUMNS, cell, districtCounts, districtLine, type AnswerSummary, type SummaryGroup, type SummaryRow } from "@/lib/summary";

/** 조건 줄 — 기준지역 · 대상 N곳 · 기준 시각(개발 서버 템플릿 ①) */
export function ConditionLine({ summary, regionName, basisAt }: { summary: AnswerSummary; regionName?: string | null; basisAt: string }) {
  return <p className="sm-cond">{[regionName, `대상 ${summary.total}곳`, basisAt && `${basisAt} 기준`].filter(Boolean).join(" · ")}</p>;
}

/** 구분별 개수(템플릿 ②) — 응답에 나온 구분 순서 그대로 */
export function CountChips({ summary }: { summary: AnswerSummary }) {
  return (
    <ul className="sm-counts" aria-label="구분별 개수">
      {summary.groups.map((g) => (
        <li key={g.key} className={`sm-count sm-tone--${g.tone}`}>
          <span className="sm-count-dot" aria-hidden="true" />
          {g.short}
          <b>{g.count}</b>
        </li>
      ))}
      {summary.others.length > 0 && (
        <li className="sm-count sm-tone--gray">
          <span className="sm-count-dot" aria-hidden="true" />
          그 밖<b>{summary.others.length}</b>
        </li>
      )}
    </ul>
  );
}

/** 「어디 — 연제구 2 · 동래구 1」. 이름을 모르면 줄을 내지 않는다 */
export function WhereLine({ group, names }: { group: SummaryGroup; names: ReadonlyMap<string, string> }) {
  const line = districtLine(districtCounts(group.rows), names);
  if (!line) return null;
  return (
    <p className="sm-where">
      <span>어디</span> {line}
    </p>
  );
}

/** 표로 보기(템플릿 ④) — 블록에 쓴 원본 값 전체, 값 없는 칸은 「—」. 기본 접힘 */
export function TableView({ summary, onEntity }: { summary: AnswerSummary; onEntity: (ref: RefLike) => void }) {
  return (
    <details className="sm-tables">
      <summary>표로 보기</summary>
      {summary.groups.map((g) => {
        const cols = BLOCK_COLUMNS[g.block];
        return (
          <div key={g.key} className="sm-table-wrap">
            <p className="sm-table-cap">
              {g.name} {g.count}곳
              {g.rows.length < g.count && <small> (받은 {g.rows.length}곳)</small>}
            </p>
            <div className="sm-table-scroll">
              <table className="ig-table sm-table">
                <thead>
                  <tr>
                    <th scope="col">이름</th>
                    <th scope="col">등급</th>
                    {cols.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row"><RowName row={r} onEntity={onEntity} /></th>
                      <td>{cell(r.grade)}</td>
                      {cols.map((c) => <td key={c.key}>{cell(r.f[c.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {summary.others.length > 0 && (
        <div className="sm-table-wrap">
          <p className="sm-table-cap">그 밖 {summary.others.length}곳</p>
          <ul className="sm-names">
            {summary.others.map((r) => <li key={r.id}><RowName row={r} onEntity={onEntity} /></li>)}
          </ul>
        </div>
      )}
    </details>
  );
}

/** 이름을 누르면 지도에서 그 자리로(개발 서버 openEntity — 「그게 어디야?」) */
function RowName({ row, onEntity }: { row: SummaryRow; onEntity: (ref: RefLike) => void }) {
  const ref = row.ref;
  if (!ref) return <>{row.name}</>;
  return <button type="button" className="sm-link" onClick={() => onEntity(ref)}>{row.name}</button>;
}
