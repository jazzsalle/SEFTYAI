"use client";
import { useState, type ReactNode } from "react";
import { type T3qEnvelope, useT3qData } from "@/lib/t3qData";
import { LIFE_KO, won } from "../summary/SimilarSummary";
import { IcRain, IcRiver, IcSlope, IcWarning, type IconProps } from "../answer/infoIcons";
import "../summary/summary.css";
import "../summary/similar.css";

/**
 * 재난사건 상세 (Figma SCR-UNE-204002) — 개발서버 features/panel/components/EventPane.tsx 그대로.
 * T3Q-10 사건을 받고 available_sections 가 true 인 것만 이어서 조회(T3Q-19 근거 · T3Q-13 피해·대응 · T3Q-12 타임라인 ·
 * T3Q-11 유사도 근거). 순서: 요약 → 근거 → 피해·복구 → 사건 타임라인 → 유사도 근거(접힘) → 사건 개요.
 * 모양은 새 Figma 시연 인포그래픽(압축형 모듈 · 값 칸 · 가로 막대 · .evp-*, summary/similar.css). 받기는 공용 조회(@/lib/t3qData).
 */
type Env<R> = T3qEnvelope<R>;
type Area = { admin_code?: string | null; name?: string | null };
type Ev = {
  display_name?: string;
  disaster_types?: (string | null)[];
  lifecycle_status?: string | null;
  time_profile?: { started_at?: string | null; ended_at?: string | null };
  representative_admin_area?: Area | null;
  affected_admin_areas?: (Area | null)[];
  affected_admin_areas_more?: boolean;
  lead_agency?: string | null;
  event_summary?: string | null;
  available_sections?: Record<string, boolean>;
};
type Factor = {
  factor_group: string;
  factor: string;
  unit: string | null;
  current_value: unknown;
  past_value: unknown;
  match: number | null;
  weight_used?: number | null;
  contribution: number | null;
};
type Sim = {
  similarity?: Record<string, unknown> | null;
  contributions?: { factor_group: string; contribution_points: number; contribution_pct: number | null }[];
  factors?: Factor[];
  similarity_reasons?: string[];
  disclaimer?: string;
};
type Recovery = { report_level: string | null; item_count: number | null; damage_amount_krw: number | null; recovery_cost_krw: number | null };
type Damage = {
  human?: Record<string, unknown>;
  property?: { property_damage_krw?: number | null };
  facilities?: {
    public?: { record_count?: number | null; damage_amount_krw?: number | null; by_category?: { category: string; record_count: number; damage_amount_krw: number }[] };
    private?: { record_count?: number | null; damage_amount_krw?: number | null };
    recovery?: Recovery[];
    damage_registers?: Record<string, unknown>[];
  };
};
type Dmg = { damage?: Damage | null };
type TlItem = Record<string, unknown> & { occurred_at: string; category: string; description: string; agency?: string | null; source_ref?: string | null };
type Tl = { total_count?: number | null; time_origin?: { note?: string | null } | null; items?: TlItem[] };
type EvdItem = Record<string, unknown> & { title?: string | null; page?: string | null; section_path?: string | null };
type Evd = { total_count?: number | null; items?: EvdItem[] };
/** T3Q-19 근거 조회 요청 — 사건 ID 로(실측 harness/demo/probe_inventory.mjs 와 같은 모양) */
const evidenceBody = (id: string) => ({ object_id: id, include_passage: true, context_paragraphs: 0, page: { page: 1, size: 20 } });

/** 선 아이콘 틀 — ../answer/infoIcons 와 같은 32칸 격자·선 두께(색은 부모 글자색) */
function Line({ size = 24, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {children}
    </svg>
  );
}
/** 태풍: 소용돌이 */
function IcTyphoon(p: IconProps) {
  return (
    <Line {...p}>
      <circle cx="16" cy="16" r="3" fill="currentColor" opacity={0.18} stroke="none" />
      <circle cx="16" cy="16" r="3" />
      <path d="M16 6c-6 0-10 4-10 10M16 26c6 0 10-4 10-10" />
      <path d="M8 6.5C11 4 19 3 23 6M24 25.5C21 28 13 29 9 26" />
    </Line>
  );
}
/** 대설: 눈 결정 */
function IcSnow(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" />
      <path d="M12.5 5.5L16 8l3.5-2.5M12.5 26.5L16 24l3.5 2.5" />
    </Line>
  );
}
/** 강풍·풍랑: 바람 줄 */
function IcWind(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M3 12h16a4 4 0 1 0-4-4" />
      <path d="M3 18h21a4 4 0 1 1-4 4" />
      <path d="M3 24h9" />
    </Line>
  );
}
/** 산불·화재: 불꽃 */
function IcFire(p: IconProps) {
  return (
    <Line {...p}>
      <path d="M16 29c-5.5 0-9-3.6-9-8.4 0-5.6 5-8.2 5.6-14.6 4 2.6 6.4 6.2 6.4 9.6 1.4-.8 2.4-2.4 2.6-4.2 2.4 2.4 3.4 5.6 3.4 9.2 0 4.8-3.5 8.4-9 8.4z" fill="currentColor" opacity={0.18} stroke="none" />
      <path d="M16 29c-5.5 0-9-3.6-9-8.4 0-5.6 5-8.2 5.6-14.6 4 2.6 6.4 6.2 6.4 9.6 1.4-.8 2.4-2.4 2.6-4.2 2.4 2.4 3.4 5.6 3.4 9.2 0 4.8-3.5 8.4-9 8.4z" />
      <path d="M16 29c-2.2 0-3.6-1.5-3.6-3.4 0-2.2 2-3.4 3.6-5.6 1.6 2.2 3.6 3.4 3.6 5.6 0 1.9-1.4 3.4-3.6 3.4z" />
    </Line>
  );
}
/** 재난유형 이름(받은 글자) → 아이콘. 그림만 고르고 글자는 바꾸지 않음 — 모르는 이름은 일반 경고 아이콘 */
const TYPE_ICON: [RegExp, (p: IconProps) => ReactNode][] = [
  [/태풍/, IcTyphoon],
  [/대설|한파|눈/, IcSnow],
  [/강풍|풍랑/, IcWind],
  [/홍수|하천|범람/, IcRiver],
  [/산사태|사면|토사/, IcSlope],
  [/산불|화재/, IcFire],
  [/호우|폭우|강우/, IcRain],
];
export function DisasterTypeIcon({ type, size = 16, className }: { type: unknown; size?: number; className?: string }) {
  const t = typeof type === "string" ? type : "";
  const Ic = TYPE_ICON.find(([re]) => re.test(t))?.[1] ?? IcWarning;
  return <>{Ic({ size, className })}</>;
}

const HUMAN_KO: Record<string, string> = { dead: "사망", missing: "실종", injured: "부상", displaced: "이재민" };
const SECTION_KO: Record<string, string> = {
  similarity: "유사도 근거",
  timeline: "타임라인",
  damage_response: "피해·대응",
  report: "중대본 보고서",
  evidence: "근거",
  satellite: "위성영상",
};
/** 받은 값 글자 — 빈 값은 「—」 */
const txt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
/** 원 단위 전체 금액(개발서버 fullWon) — 칸의 title */
const fullWon = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? `${v.toLocaleString("ko-KR")}원` : "—");
const lifeKo = (s: string) => LIFE_KO[s] ?? s;

export default function EventDetail({ id, label, ctx }: { id: string; label: string; ctx?: Record<string, unknown> | null }) {
  const evQ = useT3qData<Env<Ev>>({ api: "T3Q-10", id });
  const r = evQ.state === "ok" ? (evQ.data.result ?? null) : null;
  const av = r?.available_sections ?? {};
  // 사건 상세를 받은 뒤, 제공 항목이 true 인 것만 이어서 조회(null 이면 보내지 않음)
  const dmgQ = useT3qData<Env<Dmg>>(r && av.damage_response ? { api: "T3Q-13", id } : null);
  const tlQ = useT3qData<Env<Tl>>(r && av.timeline ? { api: "T3Q-12", id } : null);
  const evdQ = useT3qData<Env<Evd>>(r && av.evidence ? { api: "T3Q-19", body: evidenceBody(id) } : null);
  const simQ = useT3qData<Env<Sim>>(r && av.similarity && ctx ? { api: "T3Q-11", id, body: { query_context: ctx } } : null);
  const tp = r?.time_profile;
  const base = evQ.state === "ok" ? evQ.data.meta?.base_time : undefined;

  return (
    <div className="evp">
      <header className="evp-head">
        <p className="evp-id">사건 ID {id}</p>
        <h2 className="evp-title">{r?.display_name ?? label}</h2>
        {r && (
          <p className="evp-chips">
            <span className="evp-chip evp-chip--date">
              {txt(tp?.started_at)} ~ {txt(tp?.ended_at)}
            </span>
            {(r.disaster_types ?? []).map((t, i) => (
              <span key={i} className="evp-chip">{txt(t)}</span>
            ))}
            {r.lifecycle_status && <span className="evp-chip">{lifeKo(r.lifecycle_status)}</span>}
          </p>
        )}
        {r && (
          <p className="evp-sub">
            주관 {txt(r.lead_agency)} · 데이터 기준 {txt((base ?? "").replace("T", " ").slice(0, 16) || null)}
          </p>
        )}
      </header>

      {evQ.state === "loading" && <p className="evp-note">불러오는 중…</p>}
      {(evQ.state === "error" || (evQ.state === "ok" && !r)) && <p className="evp-note">사건 상세를 불러오지 못했습니다.</p>}

      {r && (
        <>
          <section className="evp-sec">
            <h3 className="evp-h">요약</h3>
            <p className="evp-lead">{txt(r.event_summary)}</p>
          </section>

          <section className="evp-sec">
            <h3 className="evp-h">근거</h3>
            {!av.evidence ? (
              <Empty />
            ) : evdQ.state === "ok" ? (
              (evdQ.data.result?.items ?? []).length === 0 ? (
                <Empty />
              ) : (
                <ul className="evp-evd">
                  {(evdQ.data.result?.items ?? []).map((it, i) => (
                    <li key={i}>
                      <b>{[it.title, it.page].filter(Boolean).join(" ")}</b>
                      {it.section_path ? <span> · {it.section_path}</span> : null}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <State s={evdQ.state} />
            )}
          </section>

          <section className="evp-sec">
            <h3 className="evp-h">피해·복구</h3>
            {!av.damage_response ? <Empty /> : dmgQ.state === "ok" ? <DamageView q={dmgQ.data.result?.damage ?? null} /> : <State s={dmgQ.state} />}
          </section>

          <section className="evp-sec">
            <h3 className="evp-h">사건 타임라인</h3>
            {!av.timeline ? (
              <Empty />
            ) : tlQ.state === "ok" ? (
              <TimelineView items={tlQ.data.result?.items ?? []} total={tlQ.data.result?.total_count ?? null} note={tlQ.data.result?.time_origin?.note ?? null} />
            ) : (
              <State s={tlQ.state} />
            )}
          </section>

          <details className="evp-sec evp-fold">
            <summary>
              <h3 className="evp-h">유사도 근거</h3>
            </summary>
            {!av.similarity || !ctx ? <Empty /> : simQ.state === "ok" ? <SimilarityView s={simQ.data.result ?? null} /> : <State s={simQ.state} />}
          </details>

          <section className="evp-sec">
            <h3 className="evp-h">사건 개요</h3>
            <dl className="evp-kv">
              <dt>재난유형</dt>
              <dd>{(r.disaster_types ?? []).filter(Boolean).join(", ") || "—"}</dd>
              <dt>진행 상태</dt>
              <dd>{r.lifecycle_status ? lifeKo(r.lifecycle_status) : "—"}</dd>
              <dt>대표지역</dt>
              <dd>{txt(r.representative_admin_area?.name)}</dd>
              <dt>관련 시도</dt>
              <dd>
                {(r.affected_admin_areas ?? []).map((a) => a?.name).filter(Boolean).join(", ") || "—"}
                {r.affected_admin_areas_more && " 외"}
              </dd>
              <dt>제공 항목</dt>
              <dd>
                {Object.entries(av)
                  .map(([k, v]) => `${SECTION_KO[k] ?? k} ${v ? "있음" : "없음"}`)
                  .join(" · ") || "—"}
              </dd>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

function Empty() {
  return <p className="evp-note">해당 정보가 제공되지 않습니다.</p>;
}

function State({ s }: { s: "loading" | "error" }) {
  return <p className="evp-note">{s === "loading" ? "불러오는 중…" : "불러오지 못했습니다."}</p>;
}

/** 피해·복구(T3Q-13) — 값 칸 + 시설유형별 피해액 막대 + 보고 단계 표. 값은 받은 그대로 */
function DamageView({ q }: { q: Damage | null }) {
  if (!q) return <Empty />;
  const human = Object.entries(q.human ?? {}).filter(([k, v]) => k !== "text" && v !== null && v !== undefined);
  const pub = q.facilities?.public;
  const pri = q.facilities?.private;
  const cats = pub?.by_category ?? [];
  const rec = q.facilities?.recovery ?? [];
  const max = Math.max(...cats.map((c) => c.damage_amount_krw), 1);
  return (
    <>
      <div className="sm-values evp-values">
        <Value v={won(q.property?.property_damage_krw)} lb="재산피해" title={fullWon(q.property?.property_damage_krw)} />
        <Value v={pub?.record_count ?? "—"} unit={typeof pub?.record_count === "number" ? "건" : undefined} lb={`공공시설 · ${won(pub?.damage_amount_krw)}`} />
        <Value v={pri?.record_count ?? "—"} unit={typeof pri?.record_count === "number" ? "건" : undefined} lb={`사유시설 · ${won(pri?.damage_amount_krw)}`} />
        {human.map(([k, v]) => (
          <Value key={k} v={typeof v === "number" ? v.toLocaleString("ko-KR") : txt(v)} unit={typeof v === "number" ? "명" : undefined} lb={HUMAN_KO[k] ?? k} />
        ))}
      </div>

      {cats.length > 0 && (
        <article className="sm-mod sm-mod--compact evp-mod">
          <h4 className="sm-mod-title">공공시설 시설유형별 피해액</h4>
          <ul className="sm-bars">
            {cats.map((c, i) => (
              <li key={`${c.category}-${i}`} className="sm-bar">
                <span className="sm-bar-label" title={c.category}>
                  {c.category} · {c.record_count}건
                </span>
                <span className="sm-bar-track" aria-hidden="true">
                  <span className="sm-bar-fill" style={{ width: `${(c.damage_amount_krw / max) * 100}%` }} />
                </span>
                <span className="sm-bar-val" title={fullWon(c.damage_amount_krw)}>{won(c.damage_amount_krw)}</span>
              </li>
            ))}
          </ul>
        </article>
      )}

      {rec.length > 0 && (
        <table className="evp-table">
          <thead>
            <tr>
              <th>보고 단계</th>
              <th>항목 수</th>
              <th>피해액</th>
              <th>복구비</th>
            </tr>
          </thead>
          <tbody>
            {rec.map((x, i) => (
              <tr key={i}>
                <td>{txt(x.report_level)}</td>
                <td>{txt(x.item_count)}</td>
                <td title={fullWon(x.damage_amount_krw)}>{won(x.damage_amount_krw)}</td>
                <td title={fullWon(x.recovery_cost_krw)}>{won(x.recovery_cost_krw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Value({ v, unit, lb, title }: { v: string | number; unit?: string; lb: string; title?: string }) {
  return (
    <div className="sm-value" title={title}>
      <span className="sm-value-num">
        {v}
        {unit && <small>{unit}</small>}
      </span>
      <span className="sm-value-label">{lb}</span>
    </div>
  );
}

const TIMELINE_SHOW = 12;

/** 사건 타임라인(T3Q-12) — 받은 순서 그대로 세로 목록. 분류별 개수 칩을 위에 */
function TimelineView({ items, total, note }: { items: TlItem[]; total: number | null; note: string | null }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return <Empty />;
  const byCat = new Map<string, number>();
  for (const i of items) byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);
  const shown = all ? items : items.slice(0, TIMELINE_SHOW);
  return (
    <>
      <ul className="sm-counts evp-counts">
        {[...byCat].map(([c, n]) => (
          <li key={c} className="sm-count sm-tone--blue">
            <span className="sm-count-dot" aria-hidden="true" />
            {c}
            <b>{n}</b>
          </li>
        ))}
      </ul>
      {typeof total === "number" && total > items.length && <p className="evp-note">전체 {total}건 중 {items.length}건을 받았습니다.</p>}
      <ol className="evp-tl">
        {shown.map((i, n) => (
          <li key={n}>
            <span className="evp-tl-at">{i.occurred_at.replace("T", " ").slice(0, 16)}</span>
            <span className="evp-tl-cat">{i.category}</span>
            <p className="evp-tl-desc">{i.description}</p>
            {i.agency && <span className="evp-tl-agency">{i.agency}</span>}
          </li>
        ))}
      </ol>
      {items.length > TIMELINE_SHOW && (
        <button type="button" className="sim-more" onClick={() => setAll((v) => !v)}>
          {all ? "접기" : `외 ${items.length - TIMELINE_SHOW}건 더 보기`}
        </button>
      )}
      {note && <p className="evp-note">{note}</p>}
    </>
  );
}

/** 유사도 근거(T3Q-11) — 요인군 기여 막대 + 요인 비교 표 + 유사 이유 */
function SimilarityView({ s }: { s: Sim | null }) {
  if (!s) return <Empty />;
  const cons = s.contributions ?? [];
  const max = Math.max(...cons.map((c) => c.contribution_points), 1);
  return (
    <>
      {cons.length > 0 && (
        <article className="sm-mod sm-mod--compact evp-mod">
          <h4 className="sm-mod-title">요인군 기여</h4>
          <ul className="sm-bars">
            {cons.map((c) => (
              <li key={c.factor_group} className="sm-bar">
                <span className="sm-bar-label">{c.factor_group}</span>
                <span className="sm-bar-track" aria-hidden="true">
                  <span className="sm-bar-fill" style={{ width: `${(c.contribution_points / max) * 100}%` }} />
                </span>
                <span className="sm-bar-val">
                  {c.contribution_points}
                  {c.contribution_pct != null && ` (${c.contribution_pct}%)`}
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}
      {(s.factors ?? []).length > 0 && (
        <table className="evp-table">
          <thead>
            <tr>
              <th>요인</th>
              <th>현재 조건</th>
              <th>과거 사례</th>
              <th>일치도</th>
              <th>기여도</th>
            </tr>
          </thead>
          <tbody>
            {(s.factors ?? []).map((f, i) => (
              <tr key={i}>
                <td>
                  {f.factor_group} · {f.factor}
                  {f.unit ? ` (${f.unit})` : ""}
                </td>
                <td>{txt(f.current_value)}</td>
                <td>{txt(f.past_value)}</td>
                <td>{txt(f.match)}</td>
                <td>{txt(f.contribution)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(s.similarity_reasons ?? []).length > 0 && (
        <ul className="evp-reasons">
          {(s.similarity_reasons ?? []).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
      {s.disclaimer && <p className="evp-note">{s.disclaimer}</p>}
    </>
  );
}
