"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { API_KO, fieldKo, gapName, GAP_KO, QUALITY_KO, statusKo } from "@/lib/labels";
import { fmtValue } from "@/lib/format";
import EventDetail from "./EventDetail";

/**
 * T3Q Data API 상세 — 봉투의 result 를 키·값 그대로 펼쳐 보인다(값 가공 없음, R0).
 * 키 이름은 T3Q 필드명 그대로 두고, 값이 객체·배열이면 들여 써서 보인다.
 */
type Env = { status?: string; result?: unknown; data_gaps?: { component: string; reason: string }[]; warnings?: { code: string; message: string }[]; meta?: { base_time?: string; quality_status?: string } };

export default function DetailPane({ apiId, id, label, ctx }: { apiId: string; id: string; label: string; ctx?: Record<string, unknown> | null }) {
  if (apiId === "T3Q-10") return <EventDetail id={id} label={label} ctx={ctx} />;
  return <GenericDetail apiId={apiId} id={id} label={label} />;
}

function GenericDetail({ apiId, id, label }: { apiId: string; id: string; label: string }) {
  const [env, setEnv] = useState<Env | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setEnv(null);
    setErr(null);
    api<{ envelope: Env }>("/api/t3q/data", { method: "POST", json: { api: apiId, id } })
      .then((r) => setEnv(r.envelope))
      .catch((e) => setErr((e as Error).message));
  }, [apiId, id]);
  return (
    <div className="dpane fadein">
      <div className="xs muted">{API_KO[apiId] ?? "상세"} · {id}</div>
      <h2 style={{ fontSize: 19, marginTop: 6 }}>{label}</h2>
      {err && <div className="notice danger" style={{ marginTop: 12 }}>{err}</div>}
      {!env && !err && <div className="muted s" style={{ marginTop: 12 }}>불러오는 중…</div>}
      {env && (
        <>
          <div className="xs muted" style={{ margin: "8px 0 12px" }}>
            {statusKo(env.status)} · 데이터 기준 {env.meta?.base_time ?? "—"}{env.meta?.quality_status ? ` · ${QUALITY_KO[env.meta.quality_status] ?? env.meta.quality_status}` : ""}
          </div>
          {env.result != null && <Tree v={env.result} />}
          <Gaps env={env} />
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
