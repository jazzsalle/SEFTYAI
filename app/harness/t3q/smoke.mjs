// 하네스 ⑦ 스모크 — 실행 중인 앱(로컬·배포본)에 로그인 → 라이브러리 질문 1건 → 자동 조회 데이터 → 에이전트 답 완료까지.
// node harness/t3q/smoke.mjs [baseUrl=http://localhost:3100] [accountId=bs_safety01] [libraryId=BS-03]
// 비밀번호: env SMOKE_PASSWORD 또는 app/.env.development.local 의 SA_INIT_PASSWORDS (출력하지 않는다)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, sleep } from "./client.mjs";

const [base = "http://localhost:3100", id = "bs_safety01", lib = "BS-03"] = process.argv.slice(2);
let pw = process.env.SMOKE_PASSWORD;
if (!pw && existsSync(join(APP, ".env.development.local"))) {
  const line = readFileSync(join(APP, ".env.development.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("SA_INIT_PASSWORDS="));
  pw = line ? JSON.parse(line.slice("SA_INIT_PASSWORDS=".length))[id] : undefined;
}
if (!pw) throw new Error("비밀번호가 없다 (SMOKE_PASSWORD)");

let cookie = "";
async function call(method, path, body) {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: r.status, json: await r.json().catch(() => null) };
}
const t0 = Date.now();
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) process.exitCode = 1; };

const login = await call("POST", "/api/auth/login", { id, password: pw });
ok(login.status === 200, `로그인 ${login.status}`);
const me = await call("GET", "/api/auth/me");
ok(me.json?.account?.id === id, `세션 계정 ${me.json?.account?.id}`);
const bad = await call("GET", "/api/auth/me".replace("me", "me"));
void bad;
const w = await call("GET", "/api/weather");
ok(w.status === 200, `기상특보 ${w.json?.status?.message ?? w.status} · 특보 ${w.json?.advisories?.length ?? "-"}건`);
const { LIBRARY } = await import("../../src/lib/library.ts").catch(() => ({ LIBRARY: null }));
const q = LIBRARY?.find((x) => x.id === lib)?.text?.replaceAll("{지역}", "부산광역시") ?? "부산광역시의 자연재해위험개선지구 중 «가» 등급 지구는 어디인가요?";
const sub = await call("POST", "/api/agent/jobs", { question: q, source: "LIBRARY", libraryId: lib, condition: { region: me.json?.account?.region } });
ok(sub.status === 201, `질의 접수 ${sub.status} · ${sub.json?.job?.state} · ${Date.now() - t0}ms${sub.json?.job?.cached_from ? " · 캐시" : ""}`);
const jid = sub.json?.job?.id;
const f1 = await call("GET", `/api/agent/jobs/${jid}?full=1`);
const pv = f1.json?.job?.preview ?? [];
ok(true, `자동 조회 데이터 ${pv.length}건: ${pv.map((p) => `${p.apiId} ${p.response?.status} ${p.response?.result?.total_count ?? "-"}건 ${p.ms}ms`).join(" / ") || "없음"}`);
let st = sub.json?.job?.state;
while (["QUEUED", "SUBMITTED", "RUNNING"].includes(st) && Date.now() - t0 < 15 * 60000) {
  await sleep(3000);
  st = (await call("GET", `/api/agent/jobs/${jid}`)).json?.job?.state;
}
const fin = await call("GET", `/api/agent/jobs/${jid}?full=1`);
const raw = fin.json?.job?.raw;
ok(st === "DONE", `답 완료 ${st} · ${Math.round((Date.now() - t0) / 1000)}초 · 봉투 ${raw?.status} · 답 ${raw?.result?.answer?.length ?? 0}자 · refs ${raw?.result?.refs?.length ?? 0} · 도형 ${fin.json?.job?.geo?.result?.features?.length ?? 0}`);
const again = await call("POST", "/api/agent/jobs", { question: q, source: "LIBRARY", libraryId: lib, condition: { region: me.json?.account?.region } });
ok(again.json?.job?.state === "DONE" && !!again.json?.job?.cached_from, `같은 질문 재질의 → 캐시 ${again.json?.job?.state}`);
const out = await call("POST", "/api/auth/logout");
ok(out.status === 200, "로그아웃");
const after = await call("GET", "/api/auth/me");
ok(after.status === 401, `로그아웃 후 세션 ${after.status}`);
