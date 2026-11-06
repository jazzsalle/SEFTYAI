#!/usr/bin/env node
/**
 * 운영 DB — 질문 모음·브리핑 세트를 개발서버 것으로 바꾼 뒤 남은 옛 데이터 지우기 (R51, 2026-11-06) — 운영자 전용.
 *   app 폴더에서
 *     node harness/ops/devserver_library_reset.mjs <개발서버 ai_demo_pin.json> --backup <백업 파일.json>            미리 보기(읽기만)
 *     node harness/ops/devserver_library_reset.mjs <개발서버 ai_demo_pin.json> --backup <백업 파일.json> --apply    실행
 *
 * DB 주소는 app/.env.local 의 DATABASE_URL(운영 Neon)만 읽는다. 비밀값·답 원문은 출력하지 않는다(표 이름·항목 id·행 수만).
 * 하는 일
 *  1) sa_demo_pins(받아 둔 답) — 개발서버 ai_demo_pin 에 답(response_json)이 있는 pin_id 만 남기고 나머지 행을 지운다
 *     (우리가 받아 둔 SH-1-*·SH-2-*·AI 모드 AIM-<지역> 등 — 개발서버에는 답이 없는 항목).
 *     지우기 전에 그 행과 연결된 sa_agent_jobs 행(job_id·pending_job_id)을 --backup 파일에 JSON 으로 적는다(되돌리기용).
 *     sa_agent_jobs 행 자체는 지우지 않는다(대화 이력이 참조한다).
 *  2) sa_kv — 계정별로 저장된 옛 「내 브리핑 항목」(scope acct:<계정>, key brief)을 지운다.
 *     새 브리핑 세트는 key briefing(개발서버 acc_optn BRIEFING 과 같은 내용 — 항목 id·이름·질의문·체크, 순서 = 실행 순서)
 *  --apply 는 한 트랜잭션(하나라도 실패하면 전부 되돌림). 백업 파일을 먼저 쓰고 나서 지운다.
 * 되돌리기: 백업 파일의 pins 를 sa_demo_pins 에 다시 넣는다(sa_agent_jobs 는 지우지 않았으므로 그대로 이어진다). briefKv 도 같은 범위·키로 다시 넣는다.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fail = (m) => { console.error("중단:", m); process.exit(1); };
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const dumpFile = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--backup") ?? fail("개발서버 ai_demo_pin.json 경로를 주세요");
const backup = flag("--backup") ? resolve(flag("--backup")) : fail("--backup <백업 파일.json> 이 필요하다");
const repo = resolve(APP, "..");
if ((backup + "\\").toLowerCase().startsWith((repo + "\\").toLowerCase()) || (backup + "/").startsWith(repo + "/")) fail("--backup 은 저장소(SEFTYAI) 밖이어야 한다 — 답 원문이 들어간다");
if (apply && existsSync(backup)) fail(`백업 파일이 이미 있다 — 덮어쓰지 않는다: ${backup}`);

let dump;
try {
  dump = JSON.parse(readFileSync(resolve(dumpFile), "utf8").replace(/^﻿/, ""));
} catch (e) {
  fail(`개발서버 파일을 읽지 못했다 — ${e.message}`);
}
if (!Array.isArray(dump)) fail("개발서버 파일은 JSON 배열이어야 한다");
const keep = new Set(dump.filter((r) => r?.pin_id && r.response_json != null).map((r) => String(r.pin_id)));
console.log(`개발서버 ai_demo_pin ${dump.length}행 · 답 있는 항목 ${keep.size}개`);

function prodUrl() {
  const line = readFileSync(join(APP, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  const url = line?.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
  if (!url || !/^postgres(ql)?:\/\//.test(url)) fail("app/.env.local 에 운영 DATABASE_URL(postgres://…)이 없다");
  return url;
}
const sql = neon(prodUrl());

const pins = await sql.query("select item_id, job_id, pending_job_id, updated_at from sa_demo_pins order by item_id");
const drop = pins.filter((p) => !keep.has(p.item_id));
const stay = pins.filter((p) => keep.has(p.item_id));
const jobIds = [...new Set(drop.flatMap((p) => [p.job_id, p.pending_job_id]).filter(Boolean))];
const jobs = jobIds.length ? await sql.query("select * from sa_agent_jobs where id = any($1::text[])", [jobIds]) : [];
const briefKv = await sql.query("select scope, key, value, rev, updated_at, updated_by from sa_kv where key = 'brief' and scope like 'acct:%' order by scope");
const newKv = await sql.query("select scope from sa_kv where key = 'briefing' and scope like 'acct:%' order by scope");

console.log(`\nsa_demo_pins ${pins.length}행 — 남김 ${stay.length} · 지움 ${drop.length}`);
console.log(`  남김: ${stay.map((p) => p.item_id).join(", ") || "없음"}`);
console.log(`  지움: ${drop.map((p) => p.item_id).join(", ") || "없음"}`);
console.log(`  지울 행에 연결된 sa_agent_jobs ${jobIds.length}개 중 찾은 행 ${jobs.length}개 → 백업(행은 지우지 않음)`);
console.log(`\nsa_kv 옛 브리핑 세트(key brief) ${briefKv.length}행 — 지움: ${briefKv.map((r) => r.scope).join(", ") || "없음"}`);
console.log(`sa_kv 새 브리핑 세트(key briefing) ${newKv.length}행 — 그대로: ${newKv.map((r) => r.scope).join(", ") || "없음"}`);

if (!apply) {
  console.log("\n미리 보기 — 바꾸지 않았다. 실행하려면 --apply");
  process.exit(0);
}

writeFileSync(
  backup,
  JSON.stringify({ at: new Date().toISOString(), note: "R51 devserver_library_reset 백업 — sa_demo_pins 지운 행·연결된 sa_agent_jobs 행(지우지 않음)·sa_kv 옛 브리핑 세트", pins: drop, jobs, briefKv }, null, 1),
  "utf8",
);
console.log(`\n백업 씀: ${backup} (pins ${drop.length} · jobs ${jobs.length} · briefKv ${briefKv.length})`);

const res = await sql.transaction((tx) => [
  tx.query("delete from sa_demo_pins where item_id = any($1::text[]) returning item_id", [drop.map((p) => p.item_id)]),
  tx.query("delete from sa_kv where key = 'brief' and scope like 'acct:%' returning scope", []),
  tx.query("insert into sa_audit (at, account_id, action, detail) values (now(), null, 'ops.devserver_library_reset', $1::jsonb)", [JSON.stringify({ pins: drop.map((p) => p.item_id), briefKv: briefKv.map((r) => r.scope) })]),
]);
console.log(`지움 — sa_demo_pins ${res[0].length}행 · sa_kv(brief) ${res[1].length}행 · sa_audit 1행 추가`);
