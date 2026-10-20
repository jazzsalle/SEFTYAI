import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * 서버 DB — Vercel에 붙인 Neon Postgres (DATABASE_URL). 연락망·상황전파 이력(D37)·대화 이력(D38) 저장
 * 표는 처음 쓸 때 만든다 (create if not exists) — 배포 후 별도 마이그레이션 없이 동작
 */
let client: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

export const hasDb = () => !!process.env.DATABASE_URL;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("서버 DB가 연결되지 않았습니다 (DATABASE_URL 없음)");
  client ??= neon(process.env.DATABASE_URL);
  return client;
}

const SCHEMA = [
  `create table if not exists sa_contact_orgs (
     org_id text primary key, rev int not null default 0, seeded_at timestamptz, updated_at timestamptz, updated_by text)`,
  `create table if not exists sa_contact_units (
     id text not null, org_id text not null, parent_id text, name text not null, kind text not null, sort int not null default 0,
     primary key (org_id, id))`,
  `create table if not exists sa_contacts (
     id text not null, org_id text not null, unit_id text not null, name text not null, title text not null default '', duty text not null default '',
     phone text not null default '', email text not null default '', office text not null default '', sort int not null default 0,
     primary key (org_id, id))`,
  `create table if not exists sa_contact_groups (
     id text not null, org_id text not null, name text not null, member_ids jsonb not null default '[]', sort int not null default 0,
     primary key (org_id, id))`,
  `create table if not exists sa_dispatches (
     id text primary key, org_id text not null, at timestamptz not null default now(), by_name text not null, by_id text not null,
     channels jsonb not null, message text not null, context text, sel jsonb not null, resend_of text,
     idem_key text not null unique, fingerprint text not null, provider text not null)`,
  `create index if not exists sa_dispatches_org_at on sa_dispatches (org_id, at desc)`,
  `create index if not exists sa_dispatches_fp on sa_dispatches (fingerprint, at desc)`,
  `create table if not exists sa_dispatch_to (
     dispatch_id text not null, contact_id text not null, channel text not null, ord int not null default 0,
     name text not null, title text not null default '', unit text not null default '', phone text not null default '', email text not null default '',
     status text not null, reason text, provider_msg_id text, requested_at timestamptz, result_at timestamptz,
     primary key (dispatch_id, contact_id, channel))`,
  `create index if not exists sa_dispatch_to_msg on sa_dispatch_to (provider_msg_id)`,
  // 대화 이력 (UFR-006-001-06) — 계정별, 대화 하나 = 한 행(질문·답변·당시 조건·참조대상 전체를 data 에)
  `create table if not exists sa_conversations (
     account_id text not null, id text not null, title text not null, region text, disaster_type text,
     created_at timestamptz not null, updated_at timestamptz not null, data jsonb not null,
     primary key (account_id, id))`,
  `create index if not exists sa_conversations_acc_upd on sa_conversations (account_id, updated_at desc)`,
  `create table if not exists sa_conv_accounts (account_id text primary key, seeded_at timestamptz not null default now())`,
  // 공통 관리로그 — 연락망 변경·발송·결과 수신 (UFR-009-002-01 변경이력)
  `create table if not exists sa_audit (
     id bigserial primary key, at timestamptz not null default now(), org_id text, account_id text, action text not null, detail jsonb)`,
];

export function ensureSchema() {
  ready ??= (async () => {
    const sql = db();
    for (const s of SCHEMA) await sql.query(s);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function audit(orgId: string | null, accountId: string | null, action: string, detail: unknown) {
  await db().query("insert into sa_audit (org_id, account_id, action, detail) values ($1, $2, $3, $4)", [orgId, accountId, action, JSON.stringify(detail ?? null)]);
}
