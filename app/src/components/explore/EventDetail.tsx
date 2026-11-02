"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { type T3qDataState, type T3qEnvelope, useT3qData } from "@/lib/t3qData";
import { fieldKo, statusKo, VALUE_KO } from "@/lib/labels";
import { fmtNum, fmtValue } from "@/lib/format";
import { BarList, compactKo, GroupBars, SERIES, StackedBar, Timeline } from "../viz/Charts";
import { Gaps, Tree } from "./DetailPane";
import { Headline } from "../answer/infoBits";
import { IcCalendar, IcEvacuate, IcFacility, IcHouseFlood, IcRain, IcRecovery, IcRiver, IcSlope, IcWarning, type IconProps } from "../answer/infoIcons";
import "../answer/demoInfo.css";
import "./eventInfo.css";

/**
 * 재난사건 상세 (Figma 204002) — T3Q-10 사건을 받고, available_sections 가 true 인 것만 이어서 조회
 * (T3Q-19 근거 · T3Q-13 피해·대응 · T3Q-12 타임라인 · T3Q-11 유사도 근거). 받기는 공용 조회(@/lib/t3qData) — 유사사례 카드가 받은 사건 상세를 다시 쓴다.
 * 순서(시각 설계 A.3 배치, R25·R41): 요약 → 근거(재해연보 쪽) → 피해·복구 → 사건 타임라인 → 유사도 근거(처음엔 접힘) → 사건 개요.
 * 값은 받은 그대로 — 같은 값도 합치지 않고, 유엔이가 센 수·읽는 법·부연 설명은 두지 않는다. 주의(⚠)는 부분 목록일 때만.
 * 숫자는 받은 그대로(건수·명·연도·번호에 쉼표를 넣지 않음), 금액(원)만 예전처럼 천 단위 쉼표. 데이터 기준 시각도 받은 글자 그대로.
 * 섹션마다 「… 원본 항목 전체 보기」 — 받은 결과 전부(화면에 고른 항목 밖의 것 포함, 키는 한국어·값은 받은 그대로).
 * 그림: V2 요인군 기여 누적 막대 · V3 타임라인 그대로, 보고 단계는 묶음 막대 대신 받은 값 표(결함 7).
 * 꾸밈: 행안부·연합뉴스 재난 그래픽 문법(띠 제목 알약 · 큰 숫자 타일 · 단색 선 아이콘 · 날짜 칩) — 값은 받은 그대로, 빨강 없음.
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

/** 요인군 색은 이름에 고정(순위·건수와 무관 — 색은 대상을 따른다) */
const GROUP_ORDER = ["재난유형", "기상·수문", "공간·취약", "피해", "대응"];
const groupColor = (g: string) => SERIES[Math.max(0, GROUP_ORDER.indexOf(g)) % SERIES.length];
/** 받은 값 글자 — 빈 값·빈 목록은 「—」, 목록은 항목마다 쉼표로 잇는다(같은 값도 그대로). 숫자는 받은 그대로(쉼표 없음) */
const txt = (v: unknown): string =>
  v == null || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.map(txt).join(", ") : "—") : typeof v === "object" ? JSON.stringify(v) : String(v);
/** 숫자 칸 — 천 단위 쉼표(번호·코드·연도 열은 그대로, lib/format.ts fmtValue), 숫자가 아니면 받은 글자 */
const num = (k: string, v: unknown) => (typeof v === "number" ? fmtValue(k, v) : txt(v));
/** 건수 — 천 단위 쉼표 + 「건」 */
const cnt = (v: unknown) => (typeof v === "number" ? `${fmtNum(v)}건` : txt(v));
/** 금액(원) — 천 단위 쉼표(자릿수 불변) */
const amt = (v: unknown) => (typeof v === "number" ? fmtNum(v) : txt(v));
const krw = (v: unknown) => (typeof v === "number" ? `${fmtNum(v)}원` : txt(v));
/** 코드 값 칸(시각 단위·기록 종류·연결 근거) — 사전(VALUE_KO)에 있으면 한국어 이름, 없으면 받은 글자 */
const CODE_KEYS = new Set(["time_precision", "record_type", "relation_basis"]);
const cellOf = (k: string, v: unknown) => (CODE_KEYS.has(k) && typeof v === "string" ? (VALUE_KO[v] ?? v) : num(k, v));
/** 받은 항목들의 키 전부 — 나오는 순서대로(앞 항목에 없던 키도 뒤에 붙인다) */
function keysOf(rows: Record<string, unknown>[]) {
  const keys: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return keys;
}
/** 제공처가 이 섹션을 주지 않음·조회하지 않음 — 빈 값 표시만(설명 문구 없음) */
const EMPTY = <p className="s ev-text">—</p>;

/** 결과가 없는 봉투 — 제공처 알림(정보 부족·경고)이 있으면 그대로, 없으면 받은 상태 */
function NoResult({ env }: { env: Env<unknown> }) {
  return env.data_gaps?.length || env.warnings?.length ? <Gaps env={env} /> : <p className="xs muted">{statusKo(env.status)}</p>;
}

/** 섹션 본문 — 받는 중 · 받지 못함 · 결과 없음 · 결과(children 이 null 이면 결과 없음으로) */
function Loaded<R>({ q, children }: { q: T3qDataState<Env<R>>; children: (r: R, env: Env<R>) => ReactNode }) {
  if (q.state === "loading") return <p className="xs muted">불러오는 중…</p>;
  if (q.state === "error") return <p className="ev-caution">⚠ {q.error}</p>;
  const view = q.data.result ? children(q.data.result, q.data) : null;
  return <>{view ?? <NoResult env={q.data} />}</>;
}

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

/** 「… 원본 항목 전체 보기」 — 받은 결과 전부(키는 한국어 이름, 값은 받은 그대로) */
function RawView({ name, v }: { name: string; v: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ev-raw">
      <button className="lnk xs" aria-expanded={open} onClick={() => setOpen((x) => !x)}>{open ? `${name} 원본 항목 닫기` : `${name} 원본 항목 전체 보기`}</button>
      {open && <Tree v={v} />}
    </div>
  );
}

export default function EventDetail({ id, label, ctx }: { id: string; label: string; ctx?: Record<string, unknown> | null }) {
  const evQ = useT3qData<Env<Ev>>({ api: "T3Q-10", id });
  const ev = evQ.state === "ok" ? evQ.data : null;
  const r = ev?.result ?? null;
  const av = r?.available_sections ?? {};
  // 사건 상세를 받은 뒤, 제공 항목이 true 인 것만 이어서 조회(null 이면 보내지 않음)
  const simQ = useT3qData<Env<Sim>>(av.similarity && ctx ? { api: "T3Q-11", id, body: { query_context: ctx } } : null);
  const dmgQ = useT3qData<Env<Dmg>>(av.damage_response ? { api: "T3Q-13", id } : null);
  const tlQ = useT3qData<Env<Tl>>(av.timeline ? { api: "T3Q-12", id } : null);
  const evdQ = useT3qData<Env<Evd>>(av.evidence ? { api: "T3Q-19", body: evidenceBody(id) } : null);
  const tp = r?.time_profile;

  return (
    <div className="dpane fadein evd">
      {/* 머리 — 사건 이름(큰 제목), 재난유형 아이콘은 받은 첫 재난유형으로 고른 그림만 */}
      <header className="evd-hero">
        {r && <span className="evd-hero-ic"><DisasterTypeIcon type={r.disaster_types?.[0]} size={30} /></span>}
        <div className="evd-hero-t">
          <div className="evd-id">사건 ID {id}</div>
          <h2 className="evd-title">{r?.display_name ?? label}</h2>
        </div>
      </header>
      {evQ.state === "error" && <div className="notice danger" style={{ marginTop: 12 }}>{evQ.error}</div>}
      {evQ.state === "loading" && <div className="muted s" style={{ marginTop: 12 }}>불러오는 중…</div>}
      {ev && !r && <div style={{ marginTop: 12 }}><NoResult env={ev} /></div>}
      {ev && r && (
        <>
          {/* 머리 칩 — 기간(날짜 칩) · 재난유형(받은 항목마다) · 진행 상태, 모두 받은 글자 그대로 */}
          <div className="ev-chips">
            <span className="di-chip"><IcCalendar size={12} /><span>{txt(tp?.started_at)}</span>~<span>{txt(tp?.ended_at)}</span></span>
            {(r.disaster_types ?? []).map((t, i) => <span key={i} className="di-tag evd-type"><DisasterTypeIcon type={t} size={13} />{txt(t)}</span>)}
            <span className="di-tag t-b">{r.lifecycle_status ? VALUE_KO[r.lifecycle_status] ?? r.lifecycle_status : "—"}</span>
          </div>
          <div className="xs muted evd-sub">
            {txt(tp?.started_at)} ~ {txt(tp?.ended_at)} · 주관 {txt(r.lead_agency)} · 데이터 기준 <span className="nowrap">{ev.meta?.base_time ?? "—"}</span>
          </div>

          <section className="ev-sec">
            <h3 className="di-pill">요약</h3>
            <p className="s ev-text ev-lead">{txt(r.event_summary)}</p>
          </section>

          <section className="ev-sec">
            <h3 className="di-pill">근거</h3>
            {!av.evidence ? EMPTY : <EvidenceView q={evdQ} />}
          </section>

          <section className="ev-sec">
            <h3 className="di-pill">피해·복구</h3>
            {!av.damage_response ? EMPTY
              : <Loaded q={dmgQ}>{(res, env) => (res.damage ? <DamageView d={res.damage} res={res} env={env} /> : null)}</Loaded>}
          </section>

          <section className="ev-sec">
            <h3 className="di-pill">사건 타임라인</h3>
            {!av.timeline ? EMPTY
              : <Loaded q={tlQ}>{(res, env) => (res.items?.length ? <TimelineView t={res} items={res.items} env={env} /> : null)}</Loaded>}
          </section>

          <details className="ev-sec ev-fold">
            <summary><h3 className="di-pill t-c">유사도 근거</h3></summary>
            {!av.similarity || !ctx ? EMPTY
              : <Loaded q={simQ}>{(res, env) => <SimilarityView s={res} env={env} />}</Loaded>}
          </details>

          <section className="ev-sec">
            <h3 className="di-pill">사건 개요</h3>
            <dl className="kv ev-kv" style={{ margin: "6px 0 8px" }}>
              <dt>재난유형</dt><dd>{txt(r.disaster_types)}</dd>
              <dt>진행 상태</dt><dd>{r.lifecycle_status ? VALUE_KO[r.lifecycle_status] ?? r.lifecycle_status : "—"}</dd>
              <dt>대표지역</dt><dd>{txt(r.representative_admin_area?.name)}</dd>
              <dt>관련 시도</dt>
              <dd>
                {txt((r.affected_admin_areas ?? []).map((a) => a?.name ?? null))}
                {r.affected_admin_areas_more === true && <span className="ev-caution"> ⚠ 관련 시도 더 있음</span>}
              </dd>
              <dt>제공 항목</dt><dd>{Object.entries(av).map(([k, v]) => `${fieldKo(k)} ${v ? "있음" : "없음"}`).join(" · ") || "—"}</dd>
            </dl>
            <RawView name="사건" v={r} />
            <Gaps env={ev} />
          </section>
        </>
      )}
    </div>
  );
}

/**
 * 근거(T3Q-19, R41) — 받은 항목마다 한 줄: 문서 제목 · 쪽 · 장 경로(받은 칸만, 받은 글자 그대로 — 고르거나 합치지 않음).
 * 데이터 기준 시각은 받은 글자 그대로. 받지 못함·결과 없음은 회색 한 줄. 받은 항목이 제공처 전체 건수보다 적을 때만 주의(타임라인과 같게)
 */
function EvidenceView({ q }: { q: T3qDataState<Env<Evd>> }) {
  if (q.state === "loading") return <p className="xs muted">불러오는 중…</p>;
  if (q.state === "error") return <p className="xs muted">{q.error}</p>;
  const env = q.data;
  const items = env.result?.items ?? [];
  if (!items.length) return <NoResult env={env} />;
  const has = (v: unknown): v is string => typeof v === "string" && v !== "";
  const total = env.result?.total_count;
  return (
    <>
      {typeof total === "number" && total > items.length && <p className="ev-caution">⚠ 전체 {total}건 중 일부만 받았습니다.</p>}
      <ul className="s ev-evd">
        {items.map((it, i) => {
          const head = [it.title, it.page].filter(has).join(" ");
          return (
            <li key={i}>
              {head && <b>{head}</b>}
              {head && has(it.section_path) ? " · " : null}
              {has(it.section_path) ? it.section_path : null}
              {!head && !has(it.section_path) ? "—" : null}
            </li>
          );
        })}
      </ul>
      {env.meta?.base_time && <div className="xs muted">데이터 기준 <span className="nowrap">{env.meta.base_time}</span></div>}
      <RawView name="근거" v={env.result} />
      <Gaps env={env} />
    </>
  );
}

/** 큰 숫자 칸 — 숫자면 천 단위 쉼표 + 단위(작은 글자), 아니면 받은 글자(빈 값은 「—」) */
const big = (v: unknown, unit: string) => (typeof v === "number" ? { v: fmtNum(v), unit } : { v: txt(v) });

/** 피해·복구(T3Q-13) — 받은 값 그대로. 시설유형 막대(받은 순서, 이름 옆에 받은 건수), 보고 단계·재해대장은 표(행마다 받은 값) */
function DamageView({ d, res, env }: { d: Damage; res: Dmg; env: Env<Dmg> }) {
  const cats = d.facilities?.public?.by_category ?? [];
  const rec = d.facilities?.recovery ?? [];
  const regs = d.facilities?.damage_registers ?? [];
  const regKeys = keysOf(regs);
  // 인명 칸은 받은 키마다 따로(같은 「—」도 합치지 않음). 받은 글(text)이 비어 있을 때만 뺀다
  const human = Object.entries(d.human ?? {}).filter(([k, v]) => !(k === "text" && v == null));
  // 큰 숫자 타일 — 받은 값만(빈 값도 「—」로 칸을 남김, 더하거나 세지 않음)
  const pub = d.facilities?.public;
  const pri = d.facilities?.private;
  const tiles = [
    { ...big(d.property?.property_damage_krw, "원"), lb: "재산피해", icon: <IcRecovery size={26} /> },
    { ...big(pub?.record_count, "건"), lb: `공공시설 · ${krw(pub?.damage_amount_krw)}`, icon: <IcFacility size={26} /> },
    { ...big(pri?.record_count, "건"), lb: `사유시설 · ${krw(pri?.damage_amount_krw)}`, icon: <IcHouseFlood size={26} /> },
    ...human.map(([k, v]) => ({ v: num(k, v), lb: fieldKo(k), icon: <IcEvacuate size={26} /> })),
  ];
  return (
    <>
      <div className="ev-head"><Headline items={tiles} /></div>
      <dl className="kv ev-kv" style={{ margin: "6px 0 4px" }}>
        <dt>재산피해</dt><dd>{krw(d.property?.property_damage_krw)}</dd>
        <dt>인명·이재민</dt><dd>{human.map(([k, v]) => `${fieldKo(k)} ${num(k, v)}`).join(" · ") || "—"}</dd>
        <dt>공공시설</dt><dd>{cnt(d.facilities?.public?.record_count)} · {krw(d.facilities?.public?.damage_amount_krw)}</dd>
        <dt>사유시설</dt><dd>{cnt(d.facilities?.private?.record_count)} · {krw(d.facilities?.private?.damage_amount_krw)}</dd>
      </dl>
      {cats.length > 0 && (
        <BarList
          title="공공시설 시설유형별 피해액"
          items={cats.map((c) => ({ label: `${c.category} · ${cnt(c.record_count)}`, value: c.damage_amount_krw }))}
          unit="원"
          axisFmt={compactKo}
          ariaLabel={`시설유형별 피해액: ${cats.map((c) => `${c.category} ${cnt(c.record_count)} ${c.damage_amount_krw}원`).join(", ")}`}
        />
      )}
      {rec.length > 0 && (
        <>
        <GroupBars
          title="보고 단계별 피해액·복구비"
          rows={rec.map((x) => ({ label: `${txt(x.report_level)}${typeof x.item_count === "number" ? ` (${num("item_count", x.item_count)}건)` : ""}`, values: [x.damage_amount_krw, x.recovery_cost_krw] }))}
          series={["피해액", "복구비"]}
          unit="원"
          axisFmt={compactKo}
          ariaLabel={`보고 단계별 피해액·복구비: ${rec.map((x) => `${txt(x.report_level)} 피해액 ${amt(x.damage_amount_krw)}원 복구비 ${amt(x.recovery_cost_krw)}원`).join(", ")}`}
        />
        <details className="xs">
          <summary>표로 보기</summary>
          <div className="md-table">
            <table>
              <thead><tr><th>보고 단계</th><th className="num">항목 수</th><th className="num">피해액(원)</th><th className="num">복구비(원)</th></tr></thead>
              <tbody>
                {rec.map((x, i) => (
                  <tr key={i}><td>{txt(x.report_level)}</td><td className="num">{num("item_count", x.item_count)}</td><td className="num">{amt(x.damage_amount_krw)}</td><td className="num">{amt(x.recovery_cost_krw)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        </>
      )}
      {regs.length > 0 && (
        <figure className="viz">
          <figcaption className="viz-title">{fieldKo("damage_registers")}</figcaption>
          <div className="md-table">
            <table>
              <thead><tr>{regKeys.map((k) => <th key={k}>{fieldKo(k)}</th>)}</tr></thead>
              <tbody>{regs.map((g, i) => <tr key={i}>{regKeys.map((k) => <td key={k}>{num(k, g[k])}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </figure>
      )}
      <RawView name="피해·대응" v={res} />
      <Gaps env={env} />
    </>
  );
}

/** 사건 타임라인(T3Q-12) — V3 그림 + 받은 기록 목록(받은 항목 전부). 받은 건수가 제공처 전체 건수보다 적을 때만 주의(제공처 전체 건수로) */
function TimelineView({ t, items, env }: { t: Tl; items: TlItem[]; env: Env<Tl> }) {
  const total = t.total_count;
  const keys = keysOf(items);
  return (
    <>
      {typeof total === "number" && total > items.length && <p className="ev-caution">⚠ 전체 {total}건 중 일부만 받았습니다.</p>}
      <Timeline
        title="특보·재난문자 기록"
        sub={t.time_origin?.note ?? undefined}
        items={items.map((i) => ({ at: i.occurred_at, category: i.category, label: i.description, detail: [i.agency, i.source_ref].filter(Boolean).join(" · ") }))}
        ariaLabel="사건 타임라인 — 특보·재난문자 기록"
      />
      {/* 받은 기록 세로 목록 — 받은 순서 그대로, 날짜 칩(받은 시각 글자) · 분류 꼬리표 · 내용 · 기관 */}
      <ol className="ev-tl-list">
        {items.map((i, n) => (
          <li key={n}>
            <span className="ev-tl-dot" aria-hidden />
            <span className="di-chip"><IcCalendar size={12} />{txt(i.occurred_at)}</span>
            <div className="ev-tl-body">
              <span className="di-tag">{txt(i.category)}</span>
              <span className="ev-tl-desc">{txt(i.description)}</span>
              {i.agency ? <span className="xs muted">{i.agency}</span> : null}
            </div>
          </li>
        ))}
      </ol>
      <details className="xs">
        <summary>기록 목록 보기</summary>
        <div className="md-table" style={{ maxHeight: 260, overflow: "auto" }}>
          <table>
            <thead><tr>{keys.map((k) => <th key={k}>{fieldKo(k)}</th>)}</tr></thead>
            <tbody>{items.map((i, n) => <tr key={n}>{keys.map((k) => <td key={k}>{cellOf(k, i[k])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
      <RawView name="사건 타임라인" v={t} />
      <Gaps env={env} />
    </>
  );
}

/** 유사도 근거(T3Q-11) — V2 요인군 기여 누적 막대(유사도 받은 키 전부를 함께) + 요인 비교표 + 유사 이유 + 유의 사항(받은 글 그대로) */
function SimilarityView({ s, env }: { s: Sim; env: Env<Sim> }) {
  const sim = s.similarity;
  const cons = s.contributions ?? [];
  // 유사도 — 받은 키 전부(점수·순위·척도·산식 판·비교에 쓴 요인 비율 등) 받은 순서·값 그대로
  const simText = sim && typeof sim === "object" ? Object.entries(sim).map(([k, v]) => `${fieldKo(k)} ${num(k, v)}`).join(" · ") : undefined;
  return (
    <>
      <StackedBar
        title="요인군 기여"
        total={simText}
        max={100}
        parts={cons.map((c) => ({ key: c.factor_group, label: c.factor_group, value: c.contribution_points, color: groupColor(c.factor_group), note: c.contribution_pct == null ? undefined : `${c.contribution_pct}%` }))}
        ariaLabel={`유사도 요인군 기여: ${cons.map((c) => `${c.factor_group} ${c.contribution_points}점`).join(", ")}`}
      />
      {(s.factors ?? []).length > 0 && <FactorCards factors={s.factors ?? []} hi={scaleHi(sim?.scale)} />}
      <details className="xs ev-ftable">
      <summary>요인 표로 보기</summary>
      <div className="md-table" style={{ maxHeight: 280, overflow: "auto" }}>
        <table>
          <thead><tr><th>요인군</th><th>요인</th><th>현재 조건</th><th>과거 사례</th><th>일치도</th><th>가중치</th><th>기여도</th></tr></thead>
          <tbody>
            {(s.factors ?? []).map((f, i) => (
              <tr key={i}><td>{f.factor_group}</td><td>{f.factor}{f.unit ? ` (${f.unit})` : ""}</td><td>{num("current_value", f.current_value)}</td><td>{num("past_value", f.past_value)}</td><td>{txt(f.match)}</td><td>{txt(f.weight_used)}</td><td>{txt(f.contribution)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      </details>
      {s.similarity_reasons?.length ? <ul className="xs ev-reasons">{s.similarity_reasons.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
      {s.disclaimer && <div className="xs muted ev-note">{s.disclaimer}</div>}
      <RawView name="유사도 근거" v={s} />
      <Gaps env={env} />
    </>
  );
}

/** 받은 척도 「0~100」 꼴의 끝값 — 기여도 막대 길이의 기준(받은 글자에서 읽기만). 모양이 다르면 null(막대 없음) */
function scaleHi(scale: unknown): number | null {
  const m = typeof scale === "string" ? /^\s*(-?[\d.]+)\s*[~-]\s*([\d.]+)\s*$/.exec(scale) : null;
  const hi = m ? Number(m[2]) : NaN;
  return Number.isFinite(hi) && hi > 0 ? hi : null;
}

/** 막대 한 줄(그림만) — 비율이 0~1 밖이거나 숫자가 아니면 막대 없이 값 글자만 */
function Meter({ lb, v, ratio, color }: { lb: string; v: unknown; ratio: number | null; color: string }) {
  const ok = ratio !== null && Number.isFinite(ratio) && ratio >= 0 && ratio <= 1;
  return (
    <div className="ev-meter">
      <span className="ev-meter-lb">{lb}</span>
      <span className="ev-meter-track" aria-hidden="true">{ok && <i style={{ width: `${(ratio * 100).toFixed(1)}%`, background: color }} />}</span>
      <b className="ev-meter-v">{txt(v)}</b>
    </div>
  );
}

/**
 * 요인 카드(T3Q-11 factors) — 받은 순서 그대로 한 장씩: 요인군 · 요인(단위) · 현재 조건 ↔ 과거 사례 · 일치도 막대 · 기여도 막대 · 가중치.
 * 일치도 막대 = 받은 일치도(0~1일 때만 그 길이) · 기여도 막대 = 받은 기여도 ÷ 받은 유사도 척도 끝값. 값 글자는 받은 그대로
 */
function FactorCards({ factors, hi }: { factors: Factor[]; hi: number | null }) {
  return (
    <ol className="ev-factors">
      {factors.map((f, i) => {
        const c = groupColor(f.factor_group);
        return (
          <li key={i} style={{ "--fc": c } as CSSProperties}>
            <div className="ev-f-h">
              <span className="ev-f-group">{f.factor_group}</span>
              <b className="ev-f-name">{f.factor}{f.unit ? <small> ({f.unit})</small> : null}</b>
            </div>
            <div className="ev-f-vs">
              <div><span>현재 조건</span><b>{num("current_value", f.current_value)}</b></div>
              <div><span>과거 사례</span><b>{num("past_value", f.past_value)}</b></div>
            </div>
            <Meter lb="일치도" v={f.match} ratio={typeof f.match === "number" ? f.match : null} color="var(--g-teal)" />
            <Meter lb="기여도" v={f.contribution} ratio={typeof f.contribution === "number" && hi !== null ? f.contribution / hi : null} color={c} />
            <div className="ev-f-w">가중치 <b>{txt(f.weight_used)}</b></div>
          </li>
        );
      })}
    </ol>
  );
}
