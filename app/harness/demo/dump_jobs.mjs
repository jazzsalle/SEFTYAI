// 하네스 — 운영 DB 에서 시연 계정의 원래 답(예열·실시간·AI 모드 점검) 원문을 내려받는다(읽기만) → check_story_quotes --rec 로 대본 인용과 견준다.
// node harness/demo/dump_jobs.mjs [--hours 30] [--out <폴더>]
//  · DB = app/.env.local 의 DATABASE_URL(운영 Neon) — select 만 한다. 로컬 PGlite 는 개발 서버가 쓰는 중이라 열지 않는다
//    (로컬 리허설 답은 harness/e2e/rehearsal.mjs 가 화면 API 로 내려받는다 — 같은 꼴)
//  · 대상: 시연 계정 셋(lib/scenario SCN_ACCOUNT)의 최근 --hours 시간 안 원래 답(재사용 사본 아님 · 완료)
//      묶음 항목 library_id DD-XX-nn → XX-nn.json · 부산 브리핑(출처 BRIEFING) n번 → BRF-BS-n.json · AI 모드 점검 → AIM-BS·AIM-IJ·AIM-YC.json — 같은 이름이 여럿이면 가장 최근 것
//  · 출력 기본 harness/recordings/prewarm_<시각>/ (+ _jobs.json = 고른 작업 목록 · 받은 시각) · 비밀값은 다루지 않는다
// 대본 §7.1 운영 순서 ③ 뒤(11/4 리허설·11/5 아침): 예열이 끝나면 이 도구로 받은 답을 사람이 읽고 §4 인용 줄을 고친 뒤
//  node harness/demo/check_story_quotes.mjs --rec <출력 폴더> 로 다시 대조한다
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { SCN_ACCOUNT } from "../../src/lib/scenario.ts";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flag = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const hours = Number(flag("--hours") ?? 30);
const out = resolve(flag("--out") ?? join(APP, "harness", "recordings", `prewarm_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`));
const fail = (m) => {
  console.error("중단:", m);
  process.exit(1);
};
if (!(hours > 0 && hours <= 24 * 7)) fail("--hours 는 1~168");

function prodUrl() {
  const line = readFileSync(join(APP, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  const url = line?.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
  if (!url || !/^postgres(ql)?:\/\//.test(url)) fail("app/.env.local 에 운영 DATABASE_URL(postgres://…)이 없다");
  return url;
}
const sql = neon(prodUrl());

const accounts = Object.values(SCN_ACCOUNT);
const short = { bs_safety01: "BS", ij_safety01: "IJ", yc_safety02: "YC" };
const since = new Date(Date.now() - hours * 3600_000);
const rows = await sql.query(
  `select id, account_id, source, library_id, turn_no, question_user, request, state, t3q_status, raw, elapsed_ms, created_at, finished_at
     from sa_agent_jobs
    where account_id = any($1) and created_at > $2 and cached_from is null and state = 'DONE'
      and (library_id like 'DD-%' or source in ('BRIEFING', 'AI_MODE'))
    order by created_at desc`,
  [accounts, since],
);

/** 작업 → 단계 번호(파일 이름) — 대본·녹화와 같은 이름 */
const keyOf = (r) => {
  if (r.library_id?.startsWith("DD-")) return r.library_id.slice(3);
  if (r.source === "BRIEFING" && r.account_id === SCN_ACCOUNT.busan && r.turn_no >= 1 && r.turn_no <= 4) return `BRF-BS-${r.turn_no}`;
  if (r.source === "AI_MODE" && short[r.account_id]) return `AIM-${short[r.account_id]}`;
  return null;
};
const picked = new Map();
for (const r of rows) {
  const k = keyOf(r);
  if (k && !picked.has(k)) picked.set(k, r); // 최근 것부터 — 처음 본 것이 가장 최근
}
mkdirSync(out, { recursive: true });
const list = [];
for (const [k, r] of [...picked].sort(([a], [b]) => a.localeCompare(b))) {
  const raw = typeof r.raw === "string" ? JSON.parse(r.raw) : r.raw;
  const request = typeof r.request === "string" ? JSON.parse(r.request) : r.request;
  writeFileSync(join(out, `${k}.json`), JSON.stringify({ id: k, account: r.account_id, question: r.question_user, jobId: r.id, cachedFrom: null, state: r.state, t3qStatus: r.t3q_status, elapsedMs: raw?.meta?.elapsed_ms ?? r.elapsed_ms ?? null, createdAt: r.created_at, finishedAt: r.finished_at, request, raw }, null, 2));
  list.push({ key: k, account: r.account_id, jobId: r.id, source: r.source, finishedAt: r.finished_at, t3qStatus: r.t3q_status, elapsedMs: raw?.meta?.elapsed_ms ?? r.elapsed_ms ?? null });
}
writeFileSync(join(out, "_jobs.json"), JSON.stringify({ at: new Date().toISOString(), hours, since: since.toISOString(), jobs: list }, null, 2));
console.log(`${out} — ${list.length}건(최근 ${hours}시간 · 원래 답만)`);
for (const x of list) console.log(`  ${x.key.padEnd(10)} ${x.account} · 받은 시각 ${new Date(x.finishedAt).toISOString()} · ${x.t3qStatus} · 처리 ${x.elapsedMs == null ? "—" : Math.round(x.elapsedMs / 100) / 10 + "초"}`);
