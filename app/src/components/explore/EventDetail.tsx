"use client";
import { useState, type ReactNode } from "react";
import { type T3qDataState, type T3qEnvelope, useT3qData } from "@/lib/t3qData";
import { fieldKo, statusKo, VALUE_KO } from "@/lib/labels";
import { fmtNum, fmtValue } from "@/lib/format";
import { BarList, compactKo, SERIES, StackedBar, Timeline } from "../viz/Charts";
import { Gaps, Tree } from "./DetailPane";

/**
 * 재난사건 상세 (Figma 204002) — T3Q-10 사건을 받고, available_sections 가 true 인 것만 이어서 조회
 * (T3Q-13 피해·대응 · T3Q-12 타임라인 · T3Q-11 유사도 근거). 받기는 공용 조회(@/lib/t3qData) — 유사사례 카드가 받은 사건 상세를 다시 쓴다.
 * 순서(시각 설계 A.3 배치, R25): 요약 → 피해·복구 → 사건 타임라인 → 유사도 근거(처음엔 접힘) → 사건 개요.
 * 값은 받은 그대로 — 같은 값도 합치지 않고, 유엔이가 센 수·읽는 법·부연 설명은 두지 않는다. 주의(⚠)는 부분 목록일 때만.
 * 숫자는 받은 그대로(건수·명·연도·번호에 쉼표를 넣지 않음), 금액(원)만 예전처럼 천 단위 쉼표. 데이터 기준 시각도 받은 글자 그대로.
 * 섹션마다 「… 원본 항목 전체 보기」 — 받은 결과 전부(화면에 고른 항목 밖의 것 포함, 키는 한국어·값은 받은 그대로).
 * 그림: V2 요인군 기여 누적 막대 · V3 타임라인 그대로, 보고 단계는 묶음 막대 대신 받은 값 표(결함 7).
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
  const tp = r?.time_profile;

  return (
    <div className="dpane fadein">
      <div className="xs muted">사건 ID {id}</div>
      <h2 style={{ fontSize: 19, marginTop: 6 }}>{r?.display_name ?? label}</h2>
      {evQ.state === "error" && <div className="notice danger" style={{ marginTop: 12 }}>{evQ.error}</div>}
      {evQ.state === "loading" && <div className="muted s" style={{ marginTop: 12 }}>불러오는 중…</div>}
      {ev && !r && <div style={{ marginTop: 12 }}><NoResult env={ev} /></div>}
      {ev && r && (
        <>
          <div className="xs muted" style={{ margin: "6px 0 10px" }}>
            {txt(tp?.started_at)} ~ {txt(tp?.ended_at)} · 주관 {txt(r.lead_agency)} · 데이터 기준 {ev.meta?.base_time ?? "—"}
          </div>

          <section className="ev-sec">
            <h3>요약</h3>
            <p className="s ev-text">{txt(r.event_summary)}</p>
          </section>

          <section className="ev-sec">
            <h3>피해·복구</h3>
            {!av.damage_response ? EMPTY
              : <Loaded q={dmgQ}>{(res, env) => (res.damage ? <DamageView d={res.damage} res={res} env={env} /> : null)}</Loaded>}
          </section>

          <section className="ev-sec">
            <h3>사건 타임라인</h3>
            {!av.timeline ? EMPTY
              : <Loaded q={tlQ}>{(res, env) => (res.items?.length ? <TimelineView t={res} items={res.items} env={env} /> : null)}</Loaded>}
          </section>

          <details className="ev-sec ev-fold">
            <summary><h3>유사도 근거</h3></summary>
            {!av.similarity || !ctx ? EMPTY
              : <Loaded q={simQ}>{(res, env) => <SimilarityView s={res} env={env} />}</Loaded>}
          </details>

          <section className="ev-sec">
            <h3>사건 개요</h3>
            <dl className="kv" style={{ margin: "6px 0 8px" }}>
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

/** 피해·복구(T3Q-13) — 받은 값 그대로. 시설유형 막대(받은 순서, 이름 옆에 받은 건수), 보고 단계·재해대장은 표(행마다 받은 값) */
function DamageView({ d, res, env }: { d: Damage; res: Dmg; env: Env<Dmg> }) {
  const cats = d.facilities?.public?.by_category ?? [];
  const rec = d.facilities?.recovery ?? [];
  const regs = d.facilities?.damage_registers ?? [];
  const regKeys = keysOf(regs);
  // 인명 칸은 받은 키마다 따로(같은 「—」도 합치지 않음). 받은 글(text)이 비어 있을 때만 뺀다
  const human = Object.entries(d.human ?? {}).filter(([k, v]) => !(k === "text" && v == null));
  return (
    <>
      <dl className="kv" style={{ margin: "6px 0 4px" }}>
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
        <figure className="viz">
          <figcaption className="viz-title">보고 단계별 피해액·복구비</figcaption>
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
        </figure>
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
      {s.similarity_reasons?.length ? <ul className="xs" style={{ margin: "6px 0", paddingLeft: 18 }}>{s.similarity_reasons.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
      {s.disclaimer && <div className="xs muted">{s.disclaimer}</div>}
      <RawView name="유사도 근거" v={s} />
      <Gaps env={env} />
    </>
  );
}
