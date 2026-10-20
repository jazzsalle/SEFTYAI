import "server-only";
import type { Account } from "../config";
import type { Conversation } from "../session";
import { db, ensureSchema } from "./db";
import { fixtureConversations } from "./fixtureConvs";

/**
 * 대화 이력 서버 저장 (UFR-006-001-06, D38) — 계정별, 본인 대화만 조회·관리
 *  · 저장 전 민감정보 마스킹 (질문·제목의 전화번호·주민등록번호·이메일)
 *  · 계정당 최근 MAX 개만 보관 (오래된 것부터 정리)
 *  · 처음 조회하는 계정은 시연용 대화 이력으로 채움
 */
export const CONV_MAX = 60;
const MAX_BYTES = 2_000_000; // 대화 하나 최대 크기 (답변 블록 포함)

type Row = Record<string, unknown>;

/** 민감정보 마스킹 — 저장 전에 사용자가 입력한 문장에만 적용 (답변은 서버가 만든 것이라 그대로) */
export function maskSensitive(s: string): string {
  return s
    .replace(/\b(\d{6})[-\s]?([1-4])\d{6}\b/g, "$1-$2******") // 주민등록번호
    .replace(/\b(01[016789])[-\s.]?(\d{3,4})[-\s.]?(\d{4})\b/g, "$1-****-$3") // 휴대전화
    .replace(/\b([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, "$1***@$2"); // 이메일
}
function clean(c: Conversation): Conversation {
  return {
    ...c,
    title: maskSensitive(String(c.title ?? "").slice(0, 200)),
    // 대기 중·실패한 턴은 저장하지 않음 (응답이 온 턴만)
    turns: (c.turns ?? []).filter((t) => !t.pending).map((t) => ({ ...t, q: maskSensitive(String(t.q ?? "")), req: t.req ? { ...t.req, question: maskSensitive(t.req.question) } : t.req })),
  };
}

export async function listConvs(acc: Account): Promise<Conversation[]> {
  await ensureSchema();
  const sql = db();
  const seeded = (await sql.query("insert into sa_conv_accounts (account_id) values ($1) on conflict do nothing returning account_id", [acc.id])) as Row[];
  if (seeded.length) {
    const fx = fixtureConversations(acc) as unknown as Conversation[];
    await putConvs(acc.id, fx);
  }
  const rows = (await sql.query("select data from sa_conversations where account_id = $1 order by updated_at desc limit $2", [acc.id, CONV_MAX])) as Row[];
  return rows.map((r) => r.data as Conversation);
}

/** 대화 저장 (여러 개 한 번에 — 브라우저에 있던 이력 옮기기에도 씀) */
export async function putConvs(accountId: string, list: Conversation[]) {
  await ensureSchema();
  const rows = list
    .filter((c) => c && typeof c.id === "string" && c.id.length <= 80 && Array.isArray(c.turns))
    .map(clean)
    .filter((c) => JSON.stringify(c).length <= MAX_BYTES)
    .map((c) => ({ id: c.id, title: c.title || "대화", region: c.region ?? null, disaster_type: c.disasterType ?? null, created_at: c.createdAt || new Date().toISOString(), updated_at: c.updatedAt || new Date().toISOString(), data: c }));
  if (!rows.length) return 0;
  const sql = db();
  await sql.transaction([
    sql.query(
      `insert into sa_conversations (account_id, id, title, region, disaster_type, created_at, updated_at, data)
       select $1, id, title, region, disaster_type, created_at, updated_at, data
       from jsonb_to_recordset($2::jsonb) as x(id text, title text, region text, disaster_type text, created_at timestamptz, updated_at timestamptz, data jsonb)
       on conflict (account_id, id) do update set title = excluded.title, region = excluded.region, disaster_type = excluded.disaster_type,
         updated_at = excluded.updated_at, data = excluded.data`,
      [accountId, JSON.stringify(rows)],
    ),
    // 계정당 최근 CONV_MAX 개만 남김
    sql.query(
      `delete from sa_conversations where account_id = $1 and id not in (
         select id from sa_conversations where account_id = $1 order by updated_at desc limit $2)`,
      [accountId, CONV_MAX],
    ),
  ]);
  return rows.length;
}

export async function deleteConvs(accountId: string, ids: string[]) {
  await ensureSchema();
  if (!ids.length) return 0;
  const r = (await db().query("delete from sa_conversations where account_id = $1 and id = any($2::text[]) returning id", [accountId, ids.slice(0, 500)])) as Row[];
  return r.length;
}

/** 운영자 — 모든 계정의 대화 (응답 검증 '실사용 질의'용, 조회만) */
export async function allConvs(): Promise<{ account: string; convs: Conversation[] }[]> {
  await ensureSchema();
  const rows = (await db().query("select account_id, data from sa_conversations order by account_id, updated_at desc")) as Row[];
  const by = new Map<string, Conversation[]>();
  for (const r of rows) by.set(r.account_id as string, [...(by.get(r.account_id as string) ?? []), r.data as Conversation]);
  return [...by].map(([account, convs]) => ({ account, convs }));
}
