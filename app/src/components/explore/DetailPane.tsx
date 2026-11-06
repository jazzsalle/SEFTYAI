"use client";
import { API_KO, fieldKo, gapName, GAP_KO } from "@/lib/labels";
import { fmtValue } from "@/lib/format";
import { useT3qData, type T3qEnvelope } from "@/lib/t3qData";
import { groupedStateOf } from "@/lib/detailGroups";
import { text, UNAVAILABLE } from "@/lib/riskObject";
import { IcCalendar, IcMapPin } from "../answer/infoIcons";
import EventDetail from "./EventDetail";
import EntityDetail, { CategoryIcon, RawView, Rows, Sec } from "./EntityDetail";
import "./tree.css";

/**
 * T3Q Data API 상세 탭 — 사건(T3Q-10) · 위험·취약 대상(T3Q-15, 개발서버 EntityTab) · 그 밖(같은 묶음 문법, R59).
 * 값은 받은 그대로(가공 없음, R0) — 칸 이름만 한국어 필드 사전으로.
 */
type Env = { data_gaps?: { component: string; reason: string }[]; warnings?: { code: string; message: string }[] };

export default function DetailPane({ apiId, id, label, ctx, hasGeometry }: { apiId: string; id: string; label: string; ctx?: Record<string, unknown> | null; hasGeometry?: boolean | null }) {
  if (apiId === "T3Q-10") return <EventDetail id={id} label={label} ctx={ctx} />;
  // 위험·취약 대상 — 개발서버 EntityTab 그대로(갈래별 묶음·이름 견줌·예외 문구)
  if (apiId === "T3Q-15") return <EntityDetail id={id} label={label} ctx={ctx} hasGeometry={hasGeometry} />;
  return <GroupedDetail apiId={apiId} id={id} label={label} />;
}

/**
 * 그 밖의 상세(계획문서 T3Q-17 · 하천 계획지식 T3Q-16 등) — 개발서버에는 이 탭이 없고 상세는 모두 EntityTab 묶음 문법으로 선다 →
 * 같은 머리·칩·알약 제목 묶음·원본 항목 전체 보기로(R59, lib/detailGroups). 예외 문구도 EntityTab 그대로
 */
function GroupedDetail({ apiId, id, label }: { apiId: string; id: string; label: string }) {
  const q = useT3qData<T3qEnvelope>({ api: apiId, id });
  const state = groupedStateOf(q);
  const d = state.kind === "ok" ? state.detail : null;
  const name = d?.name ?? label ?? id;
  const env = q.state === "ok" ? q.data : null;
  const asOf = text(env?.meta?.base_time);
  return (
    <div className="dpane entity-tab evd fadein">
      <header className="evd-hero">
        <span className="evd-hero-ic"><CategoryIcon label={`${d?.kind ?? ""} ${name}`} size={28} /></span>
        <div className="evd-hero-t">
          <div className="evd-id">{[API_KO[apiId] ?? "상세", d?.objectId ?? id].filter(Boolean).join(" · ")}</div>
          <h2 className="evd-title">{name}</h2>
        </div>
      </header>
      {d && (d.kind || d.area || d.year) && (
        <div className="ev-chips">
          {d.kind && <span className="di-tag evd-type"><CategoryIcon label={`${d.kind} ${name}`} size={13} />{d.kind}</span>}
          {d.area && <span className="di-tag t-b evd-type"><IcMapPin size={12} />{d.area}</span>}
          {d.year && <span className="di-chip"><IcCalendar size={12} />기준 {d.year}</span>}
        </div>
      )}
      {asOf && <div className="xs muted evd-sub">자료 기준 {asOf}</div>}
      {state.kind === "loading" && <p className="xs muted">상세 정보를 불러오는 중입니다…</p>}
      {(state.kind === "none" || state.kind === "failed") && <p className="xs muted">{UNAVAILABLE[state.kind]}</p>}
      {d && (
        <>
          {d.groups.map((g, i) => (
            <Sec key={`${g.title}-${i}`} title={g.title}>
              {g.rows.some((r) => r.value !== null) && <Rows rows={g.rows} />}
              {g.tree !== undefined && <Tree v={g.tree} />}
            </Sec>
          ))}
          {env?.result != null && <RawView name="상세" v={env.result} />}
        </>
      )}
    </div>
  );
}

export function Gaps({ env }: { env: Pick<Env, "data_gaps" | "warnings"> }) {
  if (!env.data_gaps?.length && !env.warnings?.length) return null;
  return (
    <div className="gaps">
      {env.data_gaps?.map((g, i) => <div key={`g${i}`}>· {gapName(g.component)} — {GAP_KO[g.reason] ?? g.reason}</div>)}
      {env.warnings?.map((w, i) => <div key={`w${i}`}>· {w.message}</div>)}
    </div>
  );
}

/** 받은 값 나무 — 값은 그대로, 숫자만 천 단위 쉼표(번호·코드·연도 열은 그대로 — k = 그 값의 열 이름) */
export function Tree({ v, k }: { v: unknown; k?: string }) {
  if (v === null || v === undefined) return <span className="mute2">없음</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="mute2">없음</span>;
    if (v.every((x) => x === null || typeof x !== "object")) return <span>{v.map((x) => (typeof x === "number" ? fmtValue(k, x) : String(x))).join(", ")}</span>;
    // 칸이 모두 단순 값인 객체 목록은 표로(열 = 받은 칸 전부, 받은 순서) — 들여쓴 나열보다 한눈에(사용자 지시 2026-11-02)
    // 칸 값이 단순 값이거나 단순 값 목록이면 「단순」으로 본다(요인별 근거 목록처럼 빈 배열·글자 배열이 섞인 경우도 표로)
    const leaf = (y: unknown) => y === null || typeof y !== "object" || (Array.isArray(y) && y.every((z) => z === null || typeof z !== "object"));
    const flat = (x: unknown) => !!x && typeof x === "object" && !Array.isArray(x) && Object.values(x as object).every(leaf);
    if (v.every(flat)) {
      const cols = [...new Set(v.flatMap((x) => Object.keys(x as object)))];
      return (
        <div className="md-table tree-table">
          <table>
            <thead><tr>{cols.map((c) => <th key={c}>{fieldKo(c)}</th>)}</tr></thead>
            <tbody>{v.map((x, i) => <tr key={i}>{cols.map((c) => <td key={c}><Tree v={(x as Record<string, unknown>)[c]} k={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    return (
      <ol className="tree-list">
        {v.map((x, i) => <li key={i}><Tree v={x} k={k} /></li>)}
      </ol>
    );
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // {key: "built_year", value: 1995} 꼴(속성 목록)은 value 의 열 이름을 그 key 로 본다
    const own = typeof o.key === "string" ? o.key : undefined;
    return (
      <dl className="kv tree">
        {Object.entries(o).map(([kk, x]) => (
          <div key={kk} style={{ display: "contents" }}>
            <dt>{fieldKo(kk)}</dt>
            <dd><Tree v={x} k={kk === "value" && own ? own : kk} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  if (typeof v === "boolean") return <span>{v ? "예" : "아니요"}</span>;
  if (typeof v === "number") return <span>{fmtValue(k, v)}</span>;
  return <span>{String(v)}</span>;
}
