import "server-only";
import { sampleBundle } from "../contactsSample";
import { checkBundle, type Bundle, type BundleRev } from "../contactsCore";
import { audit, db, ensureSchema } from "./db";

/** 연락망 서버 저장 — 기관별 통째 읽기·쓰기 (판 rev 로 동시 수정 충돌 확인). 처음 읽을 때 예시 연락망으로 채움 */

type Row = Record<string, unknown>;
const toBundle = (u: Row[], c: Row[], g: Row[]): Bundle => ({
  units: u.map((r) => ({ id: r.id as string, orgId: r.org_id as string, parentId: (r.parent_id as string) ?? null, name: r.name as string, kind: r.kind as Bundle["units"][number]["kind"], sort: r.sort as number })),
  contacts: c.map((r) => ({ id: r.id as string, orgId: r.org_id as string, unitId: r.unit_id as string, name: r.name as string, title: r.title as string, duty: r.duty as string, phone: r.phone as string, email: r.email as string, office: r.office as string, sort: r.sort as number })),
  groups: g.map((r) => ({ id: r.id as string, orgId: r.org_id as string, name: r.name as string, memberIds: (r.member_ids as string[]) ?? [], sort: r.sort as number })),
});

/** 기관 연락망 전체를 지우고 다시 넣는 문장 묶음 (한 트랜잭션 안에서 실행) */
function writeAll(orgId: string, b: Bundle) {
  const sql = db();
  return [
    sql.query("delete from sa_contact_units where org_id = $1", [orgId]),
    sql.query("delete from sa_contacts where org_id = $1", [orgId]),
    sql.query("delete from sa_contact_groups where org_id = $1", [orgId]),
    sql.query(
      `insert into sa_contact_units (id, org_id, parent_id, name, kind, sort)
       select id, $1, parent_id, name, kind, sort from jsonb_to_recordset($2::jsonb) as x(id text, parent_id text, name text, kind text, sort int)`,
      [orgId, JSON.stringify(b.units.map((u) => ({ id: u.id, parent_id: u.parentId, name: u.name, kind: u.kind, sort: u.sort })))],
    ),
    sql.query(
      `insert into sa_contacts (id, org_id, unit_id, name, title, duty, phone, email, office, sort)
       select id, $1, unit_id, name, coalesce(title, ''), coalesce(duty, ''), coalesce(phone, ''), coalesce(email, ''), coalesce(office, ''), sort
       from jsonb_to_recordset($2::jsonb) as x(id text, unit_id text, name text, title text, duty text, phone text, email text, office text, sort int)`,
      [orgId, JSON.stringify(b.contacts.map((c) => ({ id: c.id, unit_id: c.unitId, name: c.name, title: c.title, duty: c.duty, phone: c.phone, email: c.email, office: c.office ?? "", sort: c.sort })))],
    ),
    sql.query(
      `insert into sa_contact_groups (id, org_id, name, member_ids, sort)
       select id, $1, name, member_ids, sort from jsonb_to_recordset($2::jsonb) as x(id text, name text, member_ids jsonb, sort int)`,
      [orgId, JSON.stringify(b.groups.map((g) => ({ id: g.id, name: g.name, member_ids: g.memberIds, sort: g.sort })))],
    ),
  ];
}

async function readAll(orgId: string): Promise<Bundle> {
  const sql = db();
  const [u, c, g] = await sql.transaction([
    sql.query("select * from sa_contact_units where org_id = $1 order by sort, id", [orgId]),
    sql.query("select * from sa_contacts where org_id = $1 order by sort, id", [orgId]),
    sql.query("select * from sa_contact_groups where org_id = $1 order by sort, id", [orgId]),
  ], { readOnly: true });
  return toBundle(u as Row[], c as Row[], g as Row[]);
}

export async function getBundle(orgId: string): Promise<BundleRev> {
  await ensureSchema();
  const sql = db();
  let meta = (await sql.query("select rev, updated_at, updated_by from sa_contact_orgs where org_id = $1", [orgId])) as Row[];
  if (!meta.length) {
    // 처음 — [샘플] 연락망으로 채움(구성 예시, 샘플 표시). 동시에 두 요청이 와도 한쪽만 채움
    const res = (await sql.query("insert into sa_contact_orgs (org_id, rev, seeded_at) values ($1, 1, now()) on conflict do nothing returning org_id", [orgId])) as Row[];
    if (res.length) await sql.transaction(writeAll(orgId, sampleBundle(orgId)));
    meta = (await sql.query("select rev, updated_at, updated_by from sa_contact_orgs where org_id = $1", [orgId])) as Row[];
  }
  const b = await readAll(orgId);
  return { ...b, rev: meta[0].rev as number, updatedAt: meta[0].updated_at ? new Date(meta[0].updated_at as string).toISOString() : null, updatedBy: (meta[0].updated_by as string) ?? null };
}

export class Conflict extends Error {}

/**
 * 연락망 저장 — baseRev 가 지금 판과 다르면 Conflict (다른 담당자가 먼저 고침)
 * what = 관리로그에 남길 한 줄 (예: "담당자 추가 홍길동")
 */
export async function putBundle(orgId: string, input: Bundle, baseRev: number, by: { id: string; name: string }, what: string): Promise<BundleRev> {
  await ensureSchema();
  const checked = checkBundle(orgId, input);
  if (typeof checked === "string") throw new Error(checked);
  const sql = db();
  if (!((await sql.query("select 1 from sa_contact_orgs where org_id = $1", [orgId])) as Row[]).length) await getBundle(orgId);
  try {
    await sql.transaction([
      // 판이 다르면 0으로 나눠 트랜잭션 전체를 되돌림
      sql.query("select 1 / (case when rev = $2 then 1 else 0 end) from sa_contact_orgs where org_id = $1 for update", [orgId, baseRev]),
      sql.query("update sa_contact_orgs set rev = rev + 1, updated_at = now(), updated_by = $2 where org_id = $1", [orgId, by.name]),
      ...writeAll(orgId, checked),
    ]);
  } catch (e) {
    if (/division by zero/i.test(String((e as Error)?.message))) throw new Conflict("다른 담당자가 먼저 연락망을 고쳤습니다. 새로 불러온 뒤 다시 하세요.");
    throw e;
  }
  await audit(orgId, by.id, "연락망 변경", { what, units: checked.units.length, contacts: checked.contacts.length, groups: checked.groups.length });
  return getBundle(orgId);
}
