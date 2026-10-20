import "server-only";
import type { Account } from "../config";
import { myOrg } from "../contactsCore";
import { audit, db, ensureSchema } from "./db";
import { maskSensitive } from "./convStore";

/**
 * 설정·수정본·응답검증 서버 저장 (D39) — 범위(scope)별 키-값
 *  · acct:<계정ID>   본인만 (내 브리핑 항목)
 *  · org:<기관>      그 기관 담당자 (대응절차 수정본) — 읽기·쓰기 모두 같은 기관, 운영자는 읽기만
 *  · verify          시스템 운영자 (응답 정합성 검증 — 판정·정답값·실행 결과·직접 등록 문항)
 * 판(rev)을 보내면 지금 판과 같을 때만 저장 — 다르면 다른 사람이 먼저 고친 것
 */
type Row = Record<string, unknown>;
export interface KvItem { value: unknown; rev: number; updatedAt: string; updatedBy: string | null }

export function scopeAccess(who: Account, scope: string): { read: boolean; write: boolean } {
  if (scope === `acct:${who.id}`) return { read: true, write: true };
  if (scope.startsWith("org:")) {
    const org = scope.slice(4);
    const mine = myOrg(who) === org;
    return { read: mine || who.role === "운영자", write: mine };
  }
  if (scope === "verify") return { read: who.role === "운영자", write: who.role === "운영자" };
  return { read: false, write: false };
}

export async function kvGet(scope: string): Promise<Record<string, KvItem>> {
  await ensureSchema();
  const rows = (await db().query("select key, value, rev, updated_at, updated_by from sa_kv where scope = $1", [scope])) as Row[];
  return Object.fromEntries(rows.map((r) => [r.key as string, { value: r.value, rev: r.rev as number, updatedAt: new Date(r.updated_at as string).toISOString(), updatedBy: (r.updated_by as string) ?? null }]));
}

export class KvConflict extends Error {
  constructor(public latest: KvItem | null) {
    super("다른 사람이 먼저 고쳤습니다. 새로 불러온 내용을 확인한 뒤 다시 하세요.");
  }
}

/** 저장 (value === null → 지움) · baseRev 를 주면 판 확인 (0 = 아직 없어야 함) */
export async function kvPut(scope: string, key: string, value: unknown, by: Account, baseRev?: number): Promise<KvItem | null> {
  await ensureSchema();
  const sql = db();
  const json = value === null ? null : JSON.stringify(value);
  if (json && json.length > 3_000_000) throw new Error("저장할 내용이 너무 큽니다.");
  if (value === null) {
    await sql.query("delete from sa_kv where scope = $1 and key = $2", [scope, key]);
    return null;
  }
  const rows = (await sql.query(
    `insert into sa_kv (scope, key, value, rev, updated_at, updated_by) values ($1, $2, $3::jsonb, 1, now(), $4)
     on conflict (scope, key) do update set value = excluded.value, rev = sa_kv.rev + 1, updated_at = now(), updated_by = excluded.updated_by
       where $5::int is null or sa_kv.rev = $5::int
     returning rev, updated_at`,
    [scope, key, json, by.name, baseRev ?? null],
  )) as Row[];
  if (!rows.length || (baseRev === 0 && (rows[0].rev as number) !== 1)) {
    const latest = (await kvGet(scope))[key] ?? null;
    throw new KvConflict(latest);
  }
  return { value, rev: rows[0].rev as number, updatedAt: new Date(rows[0].updated_at as string).toISOString(), updatedBy: by.name };
}

/* ---------------------------------------------------------------- 대응절차 체크 (기관 공용) */
/** 체크 범위 — 소속 기관 (운영자는 개인) */
export const checkScope = (who: Account) => (myOrg(who) ? `org:${myOrg(who)}` : `acct:${who.id}`);

export async function checksGet(scope: string): Promise<Record<string, { by: string; at: string }>> {
  await ensureSchema();
  const rows = (await db().query("select key, by_name, at from sa_checks where scope = $1", [scope])) as Row[];
  return Object.fromEntries(rows.map((r) => [r.key as string, { by: r.by_name as string, at: new Date(r.at as string).toISOString() }]));
}
export async function checkSet(scope: string, key: string, done: boolean, who: Account) {
  await ensureSchema();
  const sql = db();
  if (done) await sql.query("insert into sa_checks (scope, key, by_id, by_name) values ($1, $2, $3, $4) on conflict (scope, key) do nothing", [scope, key, who.id, who.name]);
  else await sql.query("delete from sa_checks where scope = $1 and key = $2", [scope, key]);
}
/** 새 상황으로 시작 — 기관 체크를 모두 비움 (관리로그에 남김) */
export async function checksReset(scope: string, who: Account, prefix?: string) {
  await ensureSchema();
  const r = (await db().query("delete from sa_checks where scope = $1 and ($2::text is null or key like $2 || '%') returning key", [scope, prefix ?? null])) as Row[];
  await audit(scope.startsWith("org:") ? scope.slice(4) : null, who.id, "대응절차 체크 비움", { scope, prefix: prefix ?? null, cleared: r.length });
  return r.length;
}

/* ---------------------------------------------------------------- 연계 추적로그 */
export interface TraceIn { accountId: string | null; api: string; intent: string; status: string; ms: number; q: string; requestId: string; datasets: string[] }
export async function traceAdd(t: TraceIn) {
  await ensureSchema();
  await db().query(
    "insert into sa_trace (account_id, api, intent, status, ms, q, request_id, datasets) values ($1, $2, $3, $4, $5, $6, $7, $8)",
    [t.accountId, t.api.slice(0, 300), t.intent.slice(0, 80), t.status.slice(0, 40), Math.round(t.ms), maskSensitive(t.q).slice(0, 2000), t.requestId.slice(0, 80), JSON.stringify(t.datasets.slice(0, 50))],
  );
}
export async function traceList(limit = 300) {
  await ensureSchema();
  const rows = (await db().query("select * from sa_trace order by at desc limit $1", [limit])) as Row[];
  return rows.map((r) => ({ at: new Date(r.at as string).toISOString(), account: (r.account_id as string) ?? "-", api: r.api as string, intent: r.intent as string, status: r.status as string, ms: r.ms as number, q: r.q as string, requestId: r.request_id as string, datasets: (r.datasets as string[]) ?? [] }));
}
