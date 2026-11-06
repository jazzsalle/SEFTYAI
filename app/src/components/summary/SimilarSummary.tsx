"use client";
import { useMemo, useState } from "react";
import { useT3qData, type T3qEnvelope } from "@/lib/t3qData";
import { parseCases, type CaseMetric, type SimilarCase } from "@/lib/similarCases";
import "./summary.css";
import "./similar.css";

/**
 * 유사사례 한눈 요약 — 개발서버 features/search/similar/SimilarSummary(kjw 998facb) 그대로(R59).
 * 데이터·동작: T3Q-04 유사사례 순위(그 답을 보낸 조건 + 질문에서 읽은 재난유형 · 20건) + 1위 사건의 T3Q-10 요약·T3Q-13 피해, 누르면 사건 상세.
 * 모양: 조건 줄 · 재난유형별 사례 수 칩 · 2열 모듈(유사도 순위 / 1위 사건) · 「답에 나온 수치」(답 글 표의 강우·침수흔적 막대, CaseSummary MetricBars).
 * 값은 받은 그대로(금액만 억·만 원 — 원 값은 마우스를 올리면). 사례 비교 카드(CaseSummary)는 개발서버에서도 화면에 붙지 않아 막대만 쓴다.
 */
export interface OpenEvent {
  id: string;
  label: string;
  ctx: Record<string, unknown> | null;
}

interface SimilarItem {
  event_master_id?: string;
  display_name?: string;
  disaster_types?: string[];
  lifecycle_status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  similarity?: { rank?: number; score?: number; scale?: string; coverage?: number } | null;
  representative_admin_area?: { admin_code?: string | null; name?: string | null } | null;
}
interface Damage {
  human?: Record<string, number | string | null>;
  property?: { property_damage_krw?: number | null } | null;
  facilities?: { public?: { record_count?: number | null } | null } | null;
}

const SHOW_ROWS = 8;
export const LIFE_KO: Record<string, string> = { CLOSED: "종료", ACTIVE: "진행 중", ONGOING: "진행 중", OPEN: "진행 중" };

/** 금액 — 억·만 단위(원 값은 title 로 따로 보인다, 개발서버 won) */
export function won(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (v >= 1e8) return `${(v / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억 원`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString("ko-KR")}만 원`;
  return `${v.toLocaleString("ko-KR")}원`;
}

export default function SimilarSummary({ ctx, answer, regionName, onEvent }: {
  ctx: Record<string, unknown>;
  answer: string;
  regionName?: string | null;
  onEvent?: (ev: OpenEvent) => void;
}) {
  const list = useT3qData<T3qEnvelope<{ total_count?: number; items?: SimilarItem[] }>>({ api: "T3Q-04", body: { query_context: ctx, page: { page: 1, size: 20 } } });
  const [all, setAll] = useState(false);
  const cases = useMemo(() => parseCases(answer), [answer]);

  const items: SimilarItem[] = list.state === "ok" ? (list.data.result?.items ?? []) : [];
  const first = items[0];
  const firstId = first?.event_master_id ?? null;
  const top = useT3qData<T3qEnvelope<{ event_summary?: string | null }>>(firstId ? { api: "T3Q-10", id: firstId } : null);
  const dmg = useT3qData<T3qEnvelope<{ damage?: Damage | null }>>(firstId ? { api: "T3Q-13", id: firstId } : null);

  if (list.state === "loading") {
    return (
      <section className="sm-card sm-card--loading" aria-busy="true">
        <p className="sm-cond">유사사례를 찾는 중…</p>
      </section>
    );
  }
  if (items.length === 0 && !cases) return null;

  const open = (it: SimilarItem) => {
    if (it.event_master_id && onEvent) onEvent({ id: it.event_master_id, label: it.display_name ?? it.event_master_id, ctx });
  };

  const types = new Map<string, number>();
  for (const it of items) for (const t of it.disaster_types ?? []) types.set(t, (types.get(t) ?? 0) + 1);
  const scaleHi = Number(/[~-]\s*([\d.]+)\s*$/.exec(first?.similarity?.scale ?? "")?.[1] ?? 100) || 100;
  const shown = all ? items : items.slice(0, SHOW_ROWS);
  const total = list.state === "ok" ? (list.data.result?.total_count ?? items.length) : items.length;
  const d = dmg.state === "ok" ? dmg.data.result?.damage : null;
  const ev = top.state === "ok" ? top.data.result : null;
  const displaced = d?.human?.displaced;
  const property = d?.property?.property_damage_krw;
  const publicCount = d?.facilities?.public?.record_count;
  const wait = !!firstId && dmg.state === "loading";

  return (
    <section className="sm-card sim-card" aria-label="유사사례 한눈 요약">
      <header className="sm-card-head">
        <h3 className="sm-card-title">유사사례 · 현재 조건과 비슷한 과거 사건</h3>
      </header>
      <p className="sm-cond">{[regionName, items.length > 0 ? `유사사례 ${total}건` : null].filter(Boolean).join(" · ")}</p>

      {items.length > 0 && (
        <ul className="sm-counts" aria-label="재난유형별 사례 수">
          {[...types].map(([t, n]) => (
            <li key={t} className="sm-count sm-tone--blue">
              <span className="sm-count-dot" aria-hidden="true" />
              {t}
              <b>{n}</b>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="sm-grid2">
          <div className="sm-group">
            <article className="sm-mod sm-mod--compact">
              <h4 className="sm-mod-title">
                유사도 순위<span className="sm-mod-sub">누르면 사건 상세</span>
              </h4>
              <ol className="sims-rank">
                {shown.map((it, i) => {
                  const s = it.similarity?.score;
                  return (
                    <li key={it.event_master_id ?? i}>
                      <button type="button" onClick={() => open(it)} disabled={!it.event_master_id || !onEvent}>
                        <span className={`sim-rank-n${i < 3 ? " is-top" : ""}`}>{it.similarity?.rank ?? i + 1}</span>
                        <span className="sim-rank-name" title={it.display_name}>
                          {it.display_name ?? "—"}
                          {it.started_at && <small>{it.started_at}</small>}
                        </span>
                        <span className="sm-bar-track" aria-hidden="true">
                          {typeof s === "number" && <span className="sm-bar-fill" style={{ width: `${Math.max(0, Math.min(1, s / scaleHi)) * 100}%` }} />}
                        </span>
                        <span className="sim-rank-v">{typeof s === "number" ? s : "—"}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {items.length > SHOW_ROWS && (
                <button type="button" className="sim-more" onClick={() => setAll((v) => !v)}>
                  {all ? "접기" : `외 ${items.length - SHOW_ROWS}건 더 보기`}
                </button>
              )}
            </article>
          </div>

          {first && (
            <div className="sm-group">
              <article className="sm-mod sm-mod--compact sims-top">
                <h4 className="sm-mod-title">1위 사건</h4>
                <p className="sim-top-name">{first.display_name}</p>
                <p className="sim-top-meta">
                  {[
                    `${first.started_at ?? "—"} ~ ${first.ended_at ?? "—"}`,
                    first.representative_admin_area?.name,
                    first.lifecycle_status ? (LIFE_KO[first.lifecycle_status] ?? first.lifecycle_status) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="sm-values">
                  <div className="sm-value">
                    <span className="sm-value-num">
                      {first.similarity?.score ?? "—"}
                      <small>/{scaleHi}</small>
                    </span>
                    <span className="sm-value-label">유사도</span>
                  </div>
                  <div className="sm-value" title={typeof property === "number" ? `${property.toLocaleString("ko-KR")}원` : undefined}>
                    <span className="sm-value-num">{wait ? "…" : won(property)}</span>
                    <span className="sm-value-label">재산피해</span>
                  </div>
                  <div className="sm-value">
                    <span className="sm-value-num">
                      {wait ? "…" : typeof displaced === "number" ? displaced.toLocaleString("ko-KR") : "—"}
                      {typeof displaced === "number" && <small>명</small>}
                    </span>
                    <span className="sm-value-label">이재민</span>
                  </div>
                  <div className="sm-value">
                    <span className="sm-value-num">
                      {wait ? "…" : typeof publicCount === "number" ? publicCount : "—"}
                      {typeof publicCount === "number" && <small>건</small>}
                    </span>
                    <span className="sm-value-label">공공시설 피해</span>
                  </div>
                </div>
                {ev?.event_summary && <p className="sim-top-sum">{ev.event_summary}</p>}
                {onEvent && firstId && (
                  <button type="button" className="sim-open" onClick={() => open(first)}>
                    사건 상세 보기 ›
                  </button>
                )}
              </article>
            </div>
          )}
        </div>
      )}

      {cases && cases.metrics.length > 0 && (
        <>
          <p className="sim-sub-h">답에 나온 수치</p>
          <div className="sm-grid2">
            {cases.metrics.map((m) => (
              <div key={m.key} className="sm-group">
                <MetricBars metric={m} cases={cases.cases} />
              </div>
            ))}
          </div>
        </>
      )}

      {list.state === "error" && <p className="sm-note">유사사례 검색을 불러오지 못했습니다.</p>}
    </section>
  );
}

/** 값 막대 — 답의 표 순서 그대로. 숫자를 못 읽은 사례는 「—」(개발서버 CaseSummary MetricBars) */
export function MetricBars({ metric, cases }: { metric: CaseMetric; cases: SimilarCase[] }) {
  const max = Math.max(...metric.values.map((v) => v?.n ?? 0), 1);
  const unit = metric.key === "traces" ? "건" : "mm";
  return (
    <article className="sm-mod sm-mod--compact">
      <h4 className="sm-mod-title">
        {metric.label}
        <span className="sm-mod-sub">사례별 · {unit}</span>
      </h4>
      <ul className="sm-bars">
        {cases.map((c, i) => {
          const v = metric.values[i];
          return (
            <li key={`${c.name}-${i}`} className={`sm-bar${c.direct ? " is-direct" : ""}`}>
              <span className="sm-bar-label" title={c.name}>{c.name}</span>
              <span className="sm-bar-track" aria-hidden="true">
                {v && <span className="sm-bar-fill" style={{ width: `${(v.n / max) * 100}%` }} />}
              </span>
              <span className="sm-bar-val" title={v?.raw}>{v ? v.shown : "—"}</span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
