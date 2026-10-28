"use client";
import { useState } from "react";
import type { PreviewItem } from "@/lib/jobTypes";
import { API_KO, fieldKo, statusKo } from "@/lib/labels";
import { fmtNum, fmtValue } from "@/lib/format";
import { useExplore } from "@/components/explore/ExploreCtx";
import { Gaps } from "@/components/explore/DetailPane";

/**
 * 자동 조회 데이터 한 조회 — 표 카드. 값은 원응답 그대로, 화면은 표시 열만 고르고 열 이름을 한국어로 보인다.
 * 「모든 항목 보기」는 받은 항목의 키 전부(similarity.coverage 등도 받은 그대로, 객체는 키 전부 풀어 씀).
 */
type Col = { key: string; get: (it: Record<string, unknown>) => unknown };
/** 점 경로로 값 꺼내기 — pick("similarity.score")(item) */
export const pick = (path: string) => (it: Record<string, unknown>) =>
  path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), it);
const col = (key: string, path = key): Col => ({ key, get: pick(path) });
export const COLS: Record<string, Col[]> = {
  "T3Q-05": [col("name"), col("category"), col("type"), col("grade", "grade.value"), col("admin_name"), col("address")],
  "T3Q-30": [col("district_name"), col("flood_event", "flood_event.name"), col("flood_year"), col("started_on"), col("area_m2"), col("cause")],
  "T3Q-04": [col("rank", "similarity.rank"), col("display_name"), col("score", "similarity.score"), col("started_at"), col("ended_at"), col("representative_admin_area", "representative_admin_area.name")],
  "T3Q-06": [col("name"), col("plan_type"), col("target_area"), col("summary")],
};
/** 행을 누르면 열 상세 (ID 는 받은 값 그대로) */
export const DETAIL: Record<string, { api: string; idKey: string; nameKey: string } | undefined> = {
  "T3Q-05": { api: "T3Q-15", idKey: "object_id", nameKey: "name" },
  "T3Q-04": { api: "T3Q-10", idKey: "event_master_id", nameKey: "display_name" },
  "T3Q-06": { api: "T3Q-17", idKey: "plan_id", nameKey: "name" },
};

/**
 * 칸 글자 — 값은 그대로. 주요 항목 표(all=false)는 이름·값 객체에서 이름·값만 꺼내고, 그 밖의 객체는 「한국어 키: 값」으로 풀어 쓴다.
 * 「모든 항목 보기」(all=true)는 객체를 늘 키 전부 풀어 쓴다(행정코드 같은 옆 키도 빠지지 않게).
 * 숫자는 천 단위 쉼표(번호·코드·연도 열은 그대로 — key 로 가림, lib/format.ts fmtValue)
 */
export function cellText(v: unknown, all = false, key?: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map((x) => cellText(x, all, key)).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (!all && "name" in o && Object.keys(o).length <= 3) return cellText(o.name, false, "name");
    if (!all && "value" in o && Object.keys(o).length <= 3) return cellText(o.value, false, key);
    // {key: "built_year", value: 1995} 꼴(속성 목록)은 value 의 열 이름을 그 key 로 본다
    const own = typeof o.key === "string" ? o.key : undefined;
    return Object.entries(o).map(([k, x]) => `${fieldKo(k)}: ${cellText(x, all, k === "value" && own ? own : k)}`).join(" · ");
  }
  if (typeof v === "boolean") return v ? "있음" : "없음";
  if (typeof v === "number") return fmtValue(key, v);
  return String(v);
}

/** 받은 항목들의 키 전부 — 나오는 순서대로(앞 항목에 없던 키도 뒤에 붙인다) */
export function allKeys(items: Record<string, unknown>[]): string[] {
  const keys: string[] = [];
  for (const it of items) for (const k of Object.keys(it)) if (!keys.includes(k)) keys.push(k);
  return keys;
}

/** 조회 머리 줄(누르면 접고 폄) — 이름 · 조회 · 상태 · 전체 건수(받은 total_count) · 데이터 기준(받은 base_time 그대로) */
export function CardHead({ p, open, onToggle }: { p: PreviewItem; open: boolean; onToggle: () => void }) {
  const env = p.response;
  return (
    <button className="datacard-t" onClick={onToggle} aria-expanded={open}>
      <b>{p.label}</b>
      <span className="xs muted"> · {API_KO[p.apiId] ?? p.apiId} · {statusKo(env?.status ?? (p.http ? undefined : "ERROR"))} · 전체 {typeof env?.result?.total_count === "number" ? fmtNum(env.result.total_count) : (env?.result?.total_count ?? "—")}건 · 데이터 기준 {env?.meta?.base_time ?? "—"}</span>
    </button>
  );
}

export default function GenericCard({ p }: { p: PreviewItem }) {
  const x = useExplore();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(true);
  const env = p.response;
  const items = env?.result?.items ?? [];
  const cols = COLS[p.apiId] ?? (items[0] ? Object.keys(items[0]).slice(0, 6).map((k) => col(k)) : []);
  const keys = all ? allKeys(items) : cols.map((c) => c.key);
  const det = DETAIL[p.apiId];
  // 상세를 여는 단추를 둘 칸 — 이름 칸(없으면 첫 칸). 행 어디를 눌러도 열리고, 키보드는 이 단추로(Enter·Space 의 클릭이 행으로 올라간다)
  const btnKey = det ? (keys.includes(det.nameKey) ? det.nameKey : keys[0]) : null;
  const cells = (it: Record<string, unknown>): [string, string][] =>
    all ? keys.map((k) => [k, cellText(it[k], true, k)]) : cols.map((c) => [c.key, cellText(c.get(it), false, c.key)]);
  // 유사사례 → 사건 상세에서 유사도 근거를 같은 조건으로 비교
  const ctx = p.apiId === "T3Q-04" ? ((p.request as { query_context?: Record<string, unknown> } | null)?.query_context ?? null) : null;
  return (
    <section className="datacard-sec">
      <CardHead p={p} open={open} onToggle={() => setOpen((v) => !v)} />
      {open && (
        <>
          {items.length > 0 && (
            <div className="md-table">
              <table>
                <thead><tr>{keys.map((k) => <th key={k}>{fieldKo(k)}</th>)}</tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className={det ? "clk" : ""}
                      onClick={det ? () => x.openDetail(det.api, String(it[det.idKey]), String(it[det.nameKey] ?? it[det.idKey]), ctx) : undefined}>
                      {cells(it).map(([k, text]) => <td key={k}>{k === btnKey ? <button type="button" className="lnk">{text}</button> : text}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {env && <Gaps env={env} />}
          {items.length > 0 && <button className="lnk xs" onClick={() => setAll((v) => !v)}>{all ? "주요 항목만" : "모든 항목 보기"}</button>}
        </>
      )}
    </section>
  );
}
