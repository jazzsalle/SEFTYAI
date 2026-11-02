"use client";
import "./autoInfo.css";
import { useMemo, type ReactNode } from "react";
import type { JobFull, JobSummary, PreviewItem, T3qRef } from "@/lib/jobTypes";
import { fmtNum } from "@/lib/format";
import { useExplore } from "@/components/explore/ExploreCtx";
import { entityLabel } from "./Markdown";
import { cellText, pick } from "./cards/GenericCard";
import { Fig } from "./infoBits";
import InfoMapSvg, { type MapLabel } from "./InfoMapSvg";
import { refOrder, shapesOf } from "./infoMap";
import { IcCalendar, IcFacility, IcRain, IcWarning } from "./infoIcons";

/**
 * 답변 그림 — 받은 값만으로 규칙으로 그리는 인포그래픽(LLM 없음). 11/2 회의 코멘트(그림을 먼저, 사건 중심)에 따라 모든 답에 붙는다(사용자 승인 2026-11-02).
 * 재료는 셋뿐: ① 답변 대상(refs)+공간정보(geo) → 번호 지도 ② 자동 조회(preview) 유사사례 → 연대기, 시설 목록 → 카드 ③ 요청 조건·특보·받은 전체 건수 → 큰 숫자 타일.
 * 답 글 속 숫자는 꺼내지 않는다(글은 그대로 아래에). 유엔이가 세거나 고르거나 정렬하지 않는다 — 순서는 받은 순서·답 글 등장 순.
 */

type Item = Record<string, unknown>;
const itemsOf = (p: PreviewItem | undefined) => (p?.response?.result?.items ?? []) as Item[];
const previewOf = (full: JobFull | null | undefined, api: string) => full?.preview?.find((p) => p.api === api);

export function autoFigures(job: JobSummary, full: JobFull | null | undefined) {
  const res = full?.raw?.result;
  const refs = (res?.refs ?? []) as T3qRef[];
  const shapes = shapesOf(full?.geo);
  const withShape = new Set(shapes.map((s) => s.ref).filter(Boolean));
  const order = refOrder(typeof res?.answer === "string" ? res.answer : null, refs).filter((r) => withShape.has(r));
  const similar = itemsOf(previewOf(full, "SIMILAR_EVENT"));
  const facility = itemsOf(previewOf(full, "RISK_FACILITY"));
  return { refs, shapes, order, similar, facility, hasAny: order.length > 0 || similar.length > 0 || facility.length > 0 };
}

export default function AutoInfoPanel({ job, full }: { job: JobSummary; full: JobFull | null | undefined }) {
  const f = useMemo(() => autoFigures(job, full), [job, full]);
  // 정의된 질문(질문 모음·브리핑 문항 — 자동 조회 API 가 고정된 항목)에만. 자유 질문에는 붙이지 않는다(사용자 지시 2026-11-02)
  if (!job.library_id || !f.hasAny) return null;
  return (
    <details className="demo-info auto-info" open>
      <summary>
        <b>답변 그림</b> <span className="xs muted">받은 대상·조회 값으로 그린 그림 · 아래 답은 에이전트 응답 그대로</span>
      </summary>
      <div className="viz demo-info-body">
        <Tiles full={full} />
        {f.order.length > 0 && <AnswerMap job={job} refs={f.refs} shapes={f.shapes} order={f.order} />}
        {f.similar.length > 0 && <SimilarChronicle items={f.similar} full={full} />}
        {f.facility.length > 0 && <FacilityCards items={f.facility} p={previewOf(full, "RISK_FACILITY")!} />}
      </div>
    </details>
  );
}

// ── 큰 숫자 타일(받은 값만) — 요청 조건 · 함께 보낸 특보 · 자동 조회 전체 건수 ──
type Cond = { item?: string; label?: string; value?: number; unit?: string };
type Warn = { kind?: string; level?: string; area?: string };
function Tiles({ full }: { full: JobFull | null | undefined }) {
  const req = full?.request as { query_context?: { detail?: { conditions?: Cond[] } }; weather_warnings?: { items?: Warn[] } } | undefined;
  const conds = req?.query_context?.detail?.conditions ?? [];
  const warns = req?.weather_warnings?.items ?? [];
  const totals = (full?.preview ?? []).filter((p) => typeof p.response?.result?.total_count === "number");
  const tiles: { v: string; lb: string; tone?: string; ic: ReactNode }[] = [
    ...warns.map((w) => ({ v: `${w.kind ?? ""}${w.level ?? ""}`, lb: w.area ?? "특보", tone: "warn", ic: <IcWarning /> })),
    ...conds.map((c) => ({ v: `${fmtNum(c.value ?? 0)}${c.unit ?? ""}`, lb: `가정 · ${c.label ?? c.item ?? "조건"}`, tone: "cond", ic: <IcRain /> })),
    ...totals.map((p) => ({ v: `${fmtNum(p.response!.result!.total_count as number)}건`, lb: `${p.label} 전체(받은 건수)`, ic: p.api === "SIMILAR_EVENT" ? <IcCalendar /> : <IcFacility /> })),
  ];
  if (!tiles.length) return null;
  return (
    <div className="ai-tiles" role="list" aria-label="요청 조건과 받은 전체 건수">
      {tiles.map((t, i) => (
        <div key={i} className={`ai-tile ${t.tone ?? ""}`} role="listitem">
          <span className="ai-tile-ic">{t.ic}</span>
          <b>{t.v}</b>
          <span>{t.lb}</span>
        </div>
      ))}
    </div>
  );
}

// ── 번호 지도 — 답 글에 처음 나온 순서로 번호 ──
const TONE: Record<string, MapLabel["tone"]> = { RISK_FACTOR: "b", FACILITY: "b", FLOOD_TRACE: "c", FLOOD_MAP: "c" };
function AnswerMap({ job, refs, shapes, order }: { job: JobSummary; refs: T3qRef[]; shapes: ReturnType<typeof shapesOf>; order: string[] }) {
  const x = useExplore();
  const byRef = new Map(refs.map((r) => [r.ref, r]));
  const labels = new Map<string, MapLabel>(order.map((r, i) => [r, { num: String(i + 1), name: byRef.get(r)?.display_name ?? r, tone: TONE[byRef.get(r)?.entity_type ?? ""] ?? "a" }]));
  const approx = shapes.some((s) => s.precision === "dong_center");
  return (
    <Fig title="답변 대상 지도" src="답변 대상 · 공간정보 그대로 · 번호는 답 글에 나온 순서" label={`답변 대상 ${order.length}곳을 번호로 표시한 지도`}
      foot={approx ? "「근사」 표시는 공간정보가 동 중심 좌표를 준 대상 — 같은 동은 표지가 겹친다. 번호를 누르면 지도에서 본다." : "번호를 누르면 지도에서 본다."}>
      <div className="im-wrap">
        <InfoMapSvg shapes={shapes} labels={labels} onPick={(r) => x.showOnMap(job.id, r)} />
        <ol className="im-legend">
          {order.map((r, i) => {
            const ref = byRef.get(r);
            const s = shapes.find((q) => q.ref === r);
            return (
              <li key={r}>
                <button type="button" className={`im-num t-${labels.get(r)?.tone ?? "a"}`} onClick={() => x.showOnMap(job.id, r)} aria-label={`${i + 1} ${ref?.display_name ?? r} 지도에서 보기`}>{i + 1}</button>
                <span className="im-lname">{ref?.display_name ?? r}</span>
                <span className="xs muted">{entityLabel(ref?.entity_type ?? null)}{s?.precision === "dong_center" ? " · 근사" : ""}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </Fig>
  );
}

// ── 유사사례 연대기 — T3Q-04 받은 목록 그대로, 자리는 받은 날짜 ──
function SimilarChronicle({ items, full }: { items: Item[]; full: JobFull | null | undefined }) {
  const x = useExplore();
  const ctx = (full?.request as { query_context?: Record<string, unknown> } | undefined)?.query_context ?? null;
  const rows = items.map((it) => ({
    id: typeof it.event_master_id === "string" ? it.event_master_id : null,
    name: cellText(it.display_name),
    from: Date.parse(String(it.started_at ?? "")),
    to: Date.parse(String(it.ended_at ?? it.started_at ?? "")),
    score: pick("similarity.score")(it),
    rank: pick("similarity.rank")(it),
    area: pick("representative_admin_area.name")(it),
    types: Array.isArray(it.disaster_types) ? it.disaster_types.join("·") : null,
  }));
  const dated = rows.filter((r) => Number.isFinite(r.from));
  if (!dated.length) return null;
  const lo = Math.min(...dated.map((r) => r.from)), hi = Math.max(...dated.map((r) => (Number.isFinite(r.to) ? r.to : r.from)));
  const span = Math.max(hi - lo, 1000 * 60 * 60 * 24 * 365);
  const left = (t: number) => `${((t - lo) / span) * 100}%`;
  const width = (a: number, b: number) => `${Math.max(((Math.max(b, a) - a) / span) * 100, 0.8)}%`;
  const yLo = new Date(lo).getFullYear(), yHi = new Date(hi).getFullYear();
  const years: number[] = [];
  for (let y = yLo; y <= yHi; y += Math.max(1, Math.ceil((yHi - yLo) / 6))) years.push(y);
  return (
    <Fig title="과거 유사사례 연대기" src="유사재난 사례 조회 · 받은 순서 · 자리는 받은 발생일" label={`유사사례 ${dated.length}건을 발생일 순 시간축에 놓은 그림`} foot="사건을 누르면 사건 상세(요약·피해·복구·타임라인)가 열린다. 유사도·순위는 받은 값.">
      <div className="ai-chron">
        {dated.map((r, i) => (
          <div key={i} className="ai-chron-row">
            <div className="ai-chron-lb">
              <span className="di-chip t-a"><IcCalendar size={14} />{cellText(items[dated.indexOf(r)]?.started_at ?? "")}</span>
              {r.id ? <button type="button" className="lnk" onClick={() => x.openDetail("T3Q-10", r.id!, r.name, ctx)}>{r.name}</button> : <span>{r.name}</span>}
              <span className="xs muted">{[r.types, r.area ? `대표지역 ${cellText(r.area)}` : null, r.rank != null ? `순위 ${cellText(r.rank, false, "rank")}` : null, r.score != null ? `유사도 ${cellText(r.score, false, "score")}` : null].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="ai-chron-track"><span className="ai-chron-bar" style={{ left: left(r.from), width: width(r.from, r.to) }} /></div>
          </div>
        ))}
        <div className="ai-chron-axis">{years.map((y) => <span key={y} style={{ left: left(Date.UTC(y, 0, 1)) }}>{y}</span>)}</div>
      </div>
    </Fig>
  );
}

// ── 시설 카드 — 잠재 위험요소·취약시설 목록(T3Q-05) 받은 항목 그대로 ──
function FacilityCards({ items, p }: { items: Item[]; p: PreviewItem }) {
  const x = useExplore();
  return (
    <Fig title="잠재 위험요소·취약시설" src={`${p.label} · 받은 순서`} label={`시설 ${items.length}곳 카드`}>
      <ul className="ai-cards">
        {items.map((it, i) => {
          const id = it.object_id;
          const name = cellText(it.name);
          return (
            <li key={i}>
              {id != null ? <button type="button" className="lnk" onClick={() => x.openDetail("T3Q-15", String(id), name)}>{name}</button> : <b>{name}</b>}
              <span>{[cellText(it.category), cellText(it.type)].filter((s) => s !== "—").join(" · ")}</span>
              <span className="xs muted">{[pick("grade.value")(it) != null ? `등급 ${cellText(pick("grade.value")(it), false, "grade")}` : null, it.admin_name != null ? cellText(it.admin_name) : null].filter(Boolean).join(" · ")}</span>
            </li>
          );
        })}
      </ul>
    </Fig>
  );
}
