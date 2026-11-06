// 운영자 전용 — 개발서버가 받아 둔 시연 답(ai_demo_pin)을 우리 「질문 모음」 고정 답(sa_demo_pins)으로 가져온다(2026-11-06, 개발서버 질문 모음 맞추기).
// node harness/demo/import_pins.mjs <내보낸 파일.json> [--apply] [--account unes] [--only AIM-BS-01,AIM-BS-03]
//  · --only = 쉼표로 적은 항목만(나머지 줄은 보지 않음). 받은 시각(received_de)에 시간대가 없으면 한국 시각(+09:00)으로 읽는다(개발서버 DB 는 KST)
//  · 입력 = 개발서버 DB 에서 내보낸 JSON 배열 — 줄마다 { pin_id, question, response_json, received_de } (response_json 은 상류 봉투 원문 · 글자 또는 객체)
//      예) 개발서버 PostgreSQL(nia_ai)에서: select pin_id, question, response_json, received_de from ai_demo_pin where response_json is not null
//    답 파일은 저장소에 커밋하지 않는다(harness/recordings 밖 임시 폴더에 두고 쓴 뒤 지운다). 이 도구는 답을 만들거나 고치지 않는다 — 봉투 원문 그대로 넣는다
//  · 짝 규칙(개발서버와 같음): pin_id 가 질문 모음 「시연」(DEMO_SHOW) 또는 「한눈 요약 질의」(DAY_ITEMS) 항목이고 질문 글이 글자까지 같을 때만. 글이 다르면 그 답은 이 질문의 답이 아니다
//    봉투 status 가 SUCCESS 인 것만(우리 고정 답 규칙 — 일부 제공 등은 고정하지 않는다)
//  · 기본은 미리 보기(쓰지 않음). --apply 를 붙이면 app/.env.local 의 DATABASE_URL(운영 Neon)에 작업 행(출처 LIBRARY · 원래 답)을 넣고 고정 답으로 올린다
//    작업 행 명의 = --account(기본 unes 운영자). 받은 시각 = received_de. 비밀값은 출력하지 않는다
//  · 자동 시연 AI 모드 장면(R54·R55 — lib/autoDemoAim AIM_DEMO 의 AIM-BS-01·03)도 가져온다: 개발서버 ai_demo_pin 의 AIM 행은 T3Q 봉투가 아니라
//    개발서버가 만든 AI 모드 점검(AiModeView — checkId·answer·guides·warnings…)을 response_json 에 담고, 상류 상태는 t3q_status 칸에 있다.
//    짝 규칙: 질문 글이 우리 AI 모드 공통 질의(AIM_Q)와 글자까지 같고 · 지역 코드·가상 특보 번호가 같고 · state DONE · t3q_status SUCCESS 일 때만.
//    작업 행 = 명의 SYS-AIM-<지역코드>(우리 AI 모드 시스템 계정) · 출처 AI_MODE · raw = 개발서버 response_json 받은 그대로(고치지 않음) · t3q_status·request_id·elapsed_ms = 그 행 칸
//    /api/autodemo/aim 은 이 꼴(raw.guides)이면 개발서버 답 글(raw.answer)을 창에 그린다
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { DAY_ITEMS, DEMO_SHOW } from "../../src/lib/library.ts";
import { AIM_Q } from "../../src/lib/aiMode.ts";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const flag = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (m) => {
  console.error("중단:", m);
  process.exit(1);
};
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--account" && args[i - 1] !== "--only");
if (!file) fail("내보낸 파일(.json)을 주세요 — node harness/demo/import_pins.mjs <파일> [--apply]");
const apply = args.includes("--apply");
const account = flag("--account") ?? "unes";
const only = flag("--only") ? new Set(flag("--only").split(",").map((x) => x.trim()).filter(Boolean)) : null;
const kst = (v) => (v ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? v : `${v}+09:00`) : null);

let rows;
try {
  rows = JSON.parse(readFileSync(resolve(file), "utf8").replace(/^﻿/, ""));
} catch (e) {
  fail(`파일을 읽지 못했습니다 — ${e.message}`);
}
if (!Array.isArray(rows)) fail("JSON 배열이어야 합니다");
if (only) rows = rows.filter((r) => only.has(String(r?.pin_id ?? "")));

const items = new Map([...DEMO_SHOW, ...DAY_ITEMS].map((d) => [d.id, d]));
// 자동 시연 AI 모드 장면 — lib/autoDemoAim.ts 는 확장자 없는 가져오기가 있어 node 로 바로 읽지 못하므로 정의 줄에서 항목 id·지역 코드·가상 특보 번호를 읽는다
const aimSrc = readFileSync(join(APP, "src", "lib", "autoDemoAim.ts"), "utf8");
const AIM = new Map([...aimSrc.matchAll(/\{ id: "(AIM-[^"]+)",[^\n]*?adminCode: "(\d+)",[^\n]*?key: "([^"]+)"/g)].map((m) => [m[1], { id: m[1], adminCode: m[2], key: m[3] }]));
if (!AIM.size) fail("lib/autoDemoAim.ts 에서 AIM_DEMO 항목을 읽지 못했습니다");
const parse = (v) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v ?? null);
const plan = [];
for (const r of rows) {
  const id = String(r?.pin_id ?? "");
  const aim = AIM.get(id);
  if (aim) {
    const view = parse(r?.response_json);
    const w = parse(r?.warnings_json);
    const at = kst(r?.received_de);
    const why = r?.question !== AIM_Q ? "질문 글이 AI 모드 공통 질의와 다름" : r?.admin_code !== aim.adminCode ? "지역 코드가 다름"
      : !(w?.items ?? []).some((i) => i?.warning_key === aim.key) ? "가상 특보 번호가 다름" : r?.state !== "DONE" ? `받기 상태 ${r?.state ?? "없음"}`
      : r?.t3q_status !== "SUCCESS" ? `상류 상태 ${r?.t3q_status ?? "없음"}` : !view || typeof view !== "object" || !Array.isArray(view.guides) ? "점검 결과 없음"
      : !at || Number.isNaN(at.getTime()) ? "받은 시각 없음" : null;
    plan.push({ id, aim, view, row: r, at, why });
    continue;
  }
  const item = items.get(id);
  const env = typeof r?.response_json === "string" ? (() => { try { return JSON.parse(r.response_json); } catch { return null; } })() : r?.response_json ?? null;
  const at = kst(r?.received_de);
  const why = !item ? "질문 모음에 없는 항목" : item.text !== r?.question ? "질문 글이 다름" : !env || typeof env !== "object" ? "봉투 없음" : env.status !== "SUCCESS" ? `상류 상태 ${env.status ?? "없음"}` : !at || Number.isNaN(at.getTime()) ? "받은 시각 없음" : null;
  plan.push({ id, item, env, at, why });
}
for (const p of plan) console.log(`  ${p.id.padEnd(12)} ${p.why ? `건너뜀 — ${p.why}` : `가져옴 · 받은 시각 ${p.at.toISOString()}`}`);
const ok = plan.filter((p) => !p.why);
console.log(`${rows.length}줄 중 ${ok.length}건 가져올 수 있음${apply ? "" : " (미리 보기 — 쓰려면 --apply)"}`);
if (!apply || !ok.length) process.exit(0);

const line = readFileSync(join(APP, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
const url = line?.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
if (!url || !/^postgres(ql)?:\/\//.test(url)) fail("app/.env.local 에 DATABASE_URL(postgres://…)이 없다");
const sql = neon(url);
await sql.query(`create table if not exists sa_demo_pins (item_id text primary key, job_id text, pending_job_id text, updated_at timestamptz default now())`);
for (const p of ok) {
  const jobId = randomUUID();
  if (p.aim) {
    const request = { imported_from: "devserver ai_demo_pin", pin_id: p.id, form: "devserver AiModeView (response_json 받은 그대로)", warnings: parse(p.row.warnings_json) };
    await sql.query(
      `insert into sa_agent_jobs (id, account_id, source, library_id, question_user, question_sent, request, cache_key, state, t3q_status, t3q_request_id, http_status, raw, created_at, finished_at, elapsed_ms)
       values ($1, $2, 'AI_MODE', $3, $4, $4, $5, $6, 'DONE', $7, $8, 200, $9, $10, $10, $11)`,
      [jobId, `SYS-AIM-${p.aim.adminCode}`, p.id, AIM_Q, JSON.stringify(request), `import:${p.id}:${jobId}`, p.row.t3q_status, p.row.request_id ?? null, JSON.stringify(p.view), p.at, Number.isFinite(p.row.elapsed_ms) ? p.row.elapsed_ms : null],
    );
    await sql.query(
      `insert into sa_demo_pins (item_id, job_id, pending_job_id, updated_at) values ($1, $2, null, now())
       on conflict (item_id) do update set job_id = excluded.job_id, pending_job_id = null, updated_at = now()`,
      [p.id, jobId],
    );
    continue;
  }
  const request = { imported_from: "devserver ai_demo_pin", pin_id: p.id };
  await sql.query(
    `insert into sa_agent_jobs (id, account_id, source, library_id, question_user, question_sent, request, cache_key, state, t3q_status, http_status, raw, t3q_conversation_id, created_at, finished_at)
     values ($1, $2, 'LIBRARY', $3, $4, $4, $5, $6, 'DONE', $7, 200, $8, $9, $10, $10)`,
    [jobId, account, p.id, p.item.text, JSON.stringify(request), `import:${p.id}:${jobId}`, p.env.status, JSON.stringify(p.env), p.env.conversation_id ?? null, p.at],
  );
  await sql.query(
    `insert into sa_demo_pins (item_id, job_id, pending_job_id, updated_at) values ($1, $2, null, now())
     on conflict (item_id) do update set job_id = excluded.job_id, pending_job_id = null, updated_at = now()`,
    [p.id, jobId],
  );
}
console.log(`${ok.length}건 고정 답으로 넣음`);
