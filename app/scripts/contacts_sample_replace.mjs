// 운영 DB 연락망을 [샘플] 구성 예시로 일괄 교체하는 운영 스크립트 (2026-10-28 사용자 지시 "연락망 일괄로 바꿔").
//   node scripts/contacts_sample_replace.mjs inspect                         — 읽기만: 기관별 판·건수·수정 이력
//   node scripts/contacts_sample_replace.mjs backup <파일.json>               — 연락망 표 4개를 기관별로 통째 백업(같은 이름 파일이 있으면 거부)
//   node scripts/contacts_sample_replace.mjs apply --yes --backup <백업.json> — 백업과 지금 운영 값이 같을 때만, 4개 기관을 한 트랜잭션으로 교체
//   node scripts/contacts_sample_replace.mjs restore <백업.json> --yes [--org busan]
// DB 주소는 app/.env.local 의 DATABASE_URL(운영 Neon)만 읽는다(.env.development.local 의 로컬 DB 는 쓰지 않음).
// 바꾸는 것: sa_contact_units · sa_contacts · sa_contact_groups(4개 기관) + sa_contact_orgs 판(rev+1) + sa_audit 기관당 한 줄.
// 바꾸지 않는 것: 상황전파 이력(sa_dispatches · sa_dispatch_to) — 실행이력 보존(지시 8).
// 2026-10-28 독립 검토 3건(데이터 안전·앱 호환·운영 안전) 반영: 백업 대조·사전 보관본·일괄 검증·단일 트랜잭션·사후 확인.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { sampleBundle } from "../src/lib/contactsSample.ts";
import { checkBundle } from "../src/lib/contactsCore.ts";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORGS = ["busan", "yeongcheon", "inje", "central"];
const [cmd, arg1] = process.argv.slice(2);
const yes = process.argv.includes("--yes");
const flag = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const fail = (m) => { console.error("중단:", m); process.exit(1); };

function prodUrl() {
  const line = readFileSync(join(APP, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  const url = line?.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
  if (!url || !/^postgres(ql)?:\/\//.test(url)) fail("app/.env.local 에 운영 DATABASE_URL(postgres://…)이 없다");
  return url;
}
const sql = neon(prodUrl());

/** 기관별 4개 표를 한 시점(RepeatableRead)으로 읽는다 */
async function snapshot() {
  const out = {};
  for (const o of ORGS) {
    const [org, u, c, g] = await sql.transaction([
      sql.query("select * from sa_contact_orgs where org_id = $1", [o]),
      sql.query("select * from sa_contact_units where org_id = $1 order by sort, id", [o]),
      sql.query("select * from sa_contacts where org_id = $1 order by sort, id", [o]),
      sql.query("select * from sa_contact_groups where org_id = $1 order by sort, id", [o]),
    ], { readOnly: true, isolationLevel: "RepeatableRead" });
    out[o] = { org: org[0] ?? null, units: u, contacts: c, groups: g };
  }
  const [dis] = await sql.query("select count(*)::int as n from sa_dispatches");
  const [dto] = await sql.query("select count(*)::int as n from sa_dispatch_to");
  return { takenAt: new Date().toISOString(), orgs: out, dispatches: dis.n, dispatchTo: dto.n };
}

function summary(s) {
  console.table(ORGS.map((o) => {
    const x = s.orgs[o];
    return { org: o, rev: x.org?.rev ?? null, updated_by: x.org?.updated_by ?? null, units: x.units.length, contacts: x.contacts.length, groups: x.groups.length,
      already_sample: x.contacts.filter((c) => String(c.name).startsWith("샘플 ")).length };
  }));
  console.log(`상황전파 이력: 발송 ${s.dispatches}건 · 수신자 행 ${s.dispatchTo}건 (바꾸지 않음)`);
}

/** 백업 이후 운영 값이 바뀌었는지 — 기관 행(rev·updated_at)과 세 표의 행 전체를 견준다 */
const norm = (v) => JSON.parse(JSON.stringify(v));
function sameAsBackup(live, bak) {
  const diffs = [];
  for (const o of ORGS) {
    const a = live.orgs[o], b = bak.orgs[o];
    if (!b) { diffs.push(`${o}: 백업에 없음`); continue; }
    if ((a.org?.rev ?? null) !== (b.org?.rev ?? null) || String(a.org?.updated_at ?? "") !== String(b.org?.updated_at ?? "")) diffs.push(`${o}: 판 다름(지금 ${a.org?.rev ?? "없음"} / 백업 ${b.org?.rev ?? "없음"})`);
    for (const t of ["units", "contacts", "groups"]) if (JSON.stringify(norm(a[t])) !== JSON.stringify(norm(b[t]))) diffs.push(`${o}.${t}: 행 다름`);
  }
  return diffs;
}

/** 샘플 꾸러미 검증 — 앱의 checkBundle 을 그대로 통과(같은 값)하고, 사람이 보는 칸마다 샘플 표시 */
function validate(o, b) {
  const c = checkBundle(o, { units: b.units, contacts: b.contacts, groups: b.groups });
  if (typeof c === "string") fail(`${o} 샘플이 앱 검증(checkBundle)을 통과하지 못함: ${c}`);
  const strip = (x) => JSON.stringify({ units: x.units.map((u) => ({ ...u, orgId: o })), contacts: x.contacts.map((k) => ({ ...k, orgId: o })), groups: x.groups.map((g) => ({ ...g, orgId: o })) });
  if (strip(c) !== strip(b)) fail(`${o} 샘플이 checkBundle 정규화 뒤 달라짐`);
  if (!b.units.length || !b.contacts.length) fail(`${o} 샘플이 비어 있음`);
  for (const k of b.contacts) {
    if (!k.name.startsWith("샘플 ") || !k.title.startsWith("[샘플]") || !k.phone.startsWith("010-0000-") || !k.email.endsWith("@example.invalid") || k.office !== "000-0000-0000")
      fail(`${o} 샘플 표시가 없는 담당자: ${k.id}`);
  }
  for (const g of b.groups) if (!g.name.startsWith("[샘플]")) fail(`${o} 샘플 표시가 없는 그룹: ${g.id}`);
}

/** contactsStore.writeAll 과 같은 문장(기관 전체 삭제 후 다시 넣기) */
function writeAll(orgId, b) {
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
/** 한 기관 교체 문장들 (판 올림 + 교체 + 관리로그) — 트랜잭션은 부르는 쪽이 묶는다 */
function orgStatements(orgId, b, by, action, detail) {
  return [
    sql.query("insert into sa_contact_orgs (org_id, rev, seeded_at) values ($1, 0, now()) on conflict (org_id) do nothing", [orgId]),
    sql.query("update sa_contact_orgs set rev = rev + 1, updated_at = now(), updated_by = $2 where org_id = $1", [orgId, by]),
    ...writeAll(orgId, b),
    sql.query("insert into sa_audit (org_id, account_id, action, detail) values ($1, null, $2, $3)", [orgId, action, JSON.stringify(detail)]),
  ];
}

if (cmd === "inspect") {
  const s = await snapshot();
  summary(s);
  const aud = await sql.query("select at, org_id, account_id, action from sa_audit where action like '연락망%' order by at desc limit 30");
  console.log(`연락망 변경 관리로그 ${aud.length}건(최근 30):`);
  for (const a of aud) console.log(` ${new Date(a.at).toISOString()} ${a.org_id} ${a.account_id ?? "-"} ${a.action}`);
} else if (cmd === "backup") {
  if (!arg1) fail("백업 파일 경로가 필요하다");
  const s = await snapshot();
  writeFileSync(arg1, JSON.stringify(s, null, 2), { flag: "wx" }); // 이미 있으면 덮어쓰지 않음
  summary(s);
  console.log("백업:", arg1);
} else if (cmd === "apply") {
  if (!yes) fail("apply 는 --yes 가 있어야 실행한다");
  const bakPath = flag("--backup");
  if (!bakPath) fail("apply 는 --backup <백업.json> 이 있어야 한다(백업과 지금 값이 같을 때만 교체)");
  const bak = JSON.parse(readFileSync(bakPath, "utf8"));
  // 1) 쓰기 전 검증 — 4개 기관 샘플 모두
  const bundles = Object.fromEntries(ORGS.map((o) => [o, sampleBundle(o)]));
  for (const o of ORGS) validate(o, bundles[o]);
  // 2) 지금 운영 값 = 백업 확인, 사전 보관본 저장(덮어쓰지 않음)
  const before = await snapshot();
  const diffs = sameAsBackup(before, bak);
  if (diffs.length) fail(`백업 이후 운영 연락망이 바뀌었다 — 새로 backup 한 뒤 다시 실행:\n  ${diffs.join("\n  ")}`);
  const pre = bakPath.replace(/\.json$/, "") + `.preapply-${before.takenAt.replace(/[:.]/g, "-")}.json`;
  writeFileSync(pre, JSON.stringify(before, null, 2), { flag: "wx" });
  summary(before);
  // 3) 4개 기관을 한 트랜잭션으로
  const stmts = ORGS.flatMap((o) => orgStatements(o, bundles[o], "시스템(샘플 연락망 일괄 교체)", "연락망 샘플 일괄 교체", {
    by: "운영 스크립트 scripts/contacts_sample_replace.mjs", reason: "임의(가상 인명) 연락망 → [샘플] 구성 예시(사용자 지시 2026-10-28)", backup: bakPath, preApply: pre,
    before: { rev: before.orgs[o].org?.rev ?? null, units: before.orgs[o].units.length, contacts: before.orgs[o].contacts.length, groups: before.orgs[o].groups.length },
    after: { units: bundles[o].units.length, contacts: bundles[o].contacts.length, groups: bundles[o].groups.length },
  }));
  await sql.transaction(stmts);
  console.log(`교체 완료(한 트랜잭션 · 문장 ${stmts.length}개)`);
  // 4) 사후 확인 — 운영 값이 샘플과 정확히 같은가
  const after = await snapshot();
  summary(after);
  const bad = [];
  for (const o of ORGS) {
    const live = after.orgs[o], want = bundles[o];
    const key = (r) => `${r.id}|${r.unit_id ?? r.unitId}|${r.name}|${r.title}|${r.phone}|${r.email}`;
    const a = live.contacts.map(key).sort().join(";"), w = want.contacts.map(key).sort().join(";");
    if (a !== w) bad.push(`${o}: 담당자 내용이 샘플과 다름`);
    const gk = (r) => `${r.id}|${r.name}|${JSON.stringify(r.member_ids ?? r.memberIds)}`;
    if (live.groups.map(gk).sort().join() !== want.groups.map(gk).sort().join()) bad.push(`${o}: 그룹이 샘플과 다름`);
    if (live.contacts.length !== want.contacts.length || live.units.length !== want.units.length || live.groups.length !== want.groups.length) bad.push(`${o}: 건수 다름`);
    if (live.contacts.some((c) => !String(c.name).startsWith("샘플 "))) bad.push(`${o}: 샘플 아닌 담당자 있음`);
    if ((live.org?.rev ?? 0) !== (before.orgs[o].org?.rev ?? 0) + 1) bad.push(`${o}: 판이 1만큼 오르지 않음(동시 수정 가능성)`);
  }
  if (after.dispatches < before.dispatches || after.dispatchTo < before.dispatchTo) bad.push("상황전파 이력 건수가 줄었다");
  else if (after.dispatches !== before.dispatches) console.log(`(참고) 교체 중 상황전파가 새로 기록됨: ${before.dispatches} → ${after.dispatches} — 교체와 무관`);
  if (bad.length) fail(`교체는 저장됐지만 사후 확인에서 다름 — 확인 필요:\n  ${bad.join("\n  ")}`);
  console.log("사후 확인 통과: 4개 기관 모두 [샘플] 구성 예시와 같고, 상황전파 이력은 그대로");
} else if (cmd === "restore") {
  if (!yes || !arg1) fail("restore <백업.json> --yes [--org <id>]");
  const s = JSON.parse(readFileSync(arg1, "utf8"));
  const only = flag("--org");
  for (const o of ORGS.filter((x) => !only || x === only)) {
    const x = s.orgs[o];
    if (!x.org) {
      // 백업 때 한 번도 열린 적 없는 기관 — 행을 지워 "처음 열면 채움" 상태로 되돌림
      await sql.transaction([
        sql.query("delete from sa_contact_units where org_id = $1", [o]),
        sql.query("delete from sa_contacts where org_id = $1", [o]),
        sql.query("delete from sa_contact_groups where org_id = $1", [o]),
        sql.query("delete from sa_contact_orgs where org_id = $1", [o]),
        sql.query("insert into sa_audit (org_id, account_id, action, detail) values ($1, null, $2, $3)", [o, "연락망 백업 복원", JSON.stringify({ by: "운영 스크립트", backup: arg1, state: "never-opened" })]),
      ]);
      console.log(`복원 ${o}: 처음 상태(행 없음)`);
      continue;
    }
    const b = {
      units: x.units.map((r) => ({ id: r.id, parentId: r.parent_id, name: r.name, kind: r.kind, sort: r.sort })),
      contacts: x.contacts.map((r) => ({ id: r.id, unitId: r.unit_id, name: r.name, title: r.title, duty: r.duty, phone: r.phone, email: r.email, office: r.office, sort: r.sort })),
      groups: x.groups.map((r) => ({ id: r.id, name: r.name, memberIds: r.member_ids ?? [], sort: r.sort })),
    };
    await sql.transaction(orgStatements(o, b, "시스템(백업 복원)", "연락망 백업 복원", { by: "운영 스크립트", backup: arg1, takenAt: s.takenAt }));
    console.log(`복원 ${o}: 담당자 ${b.contacts.length}`);
  }
} else {
  console.log("사용법: inspect | backup <파일> | apply --yes --backup <파일> | restore <백업> --yes [--org <id>]");
}
