// 하네스 — 시연 질의 사슬 탐색용: 질문 하나를 실제 T3Q 에이전트(ASYNC)에 보내 원응답을 녹화하고 요약을 출력한다.
// node harness/demo/ask.mjs --region busan|inje|yeongcheon --step BS-03 --q "질문" [--source USER|SUGGEST|BRIEFING] [--types 호우,태풍]
//   [--cond '{"warning_kind":"호우","warning_level":"경보","conditions":[{"item":"RAIN_1H","label":"1시간 강우","value":50,"unit":"mm"}]}']
//   [--sub '{"admin_code":"2617000000","level":"SIGUNGU","name":"부산광역시 동구"}']   (기준지역을 시·군·구·읍·면·동으로 좁힐 때)
// → harness/recordings/demo_chain_<region>/<step>.json (요청·원응답 그대로) · 화면에 답 원문·refs·정보 부족·근거 인용 표시·처리 시간
// 토큰은 client.mjs 가 app/.env.local 에서 읽는다(출력하지 않음).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP, askAsync } from "../t3q/client.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const REGION = {
  busan: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" },
  inje: { admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" },
  yeongcheon: { admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" },
};
const region = arg("region");
const q = arg("q");
const step = arg("step", `S${Date.now()}`);
if (!REGION[region] || !q) {
  console.error("사용: --region busan|inje|yeongcheon --q \"질문\" [--step ID] [--source USER] [--cond JSON] [--sub JSON] [--types 호우]");
  process.exit(2);
}
const qc = { region: arg("sub") ? JSON.parse(arg("sub")) : REGION[region] };
const types = arg("types", "").split(",").map((s) => s.trim()).filter(Boolean);
if (types.length) qc.disaster_types = types;
const cond = arg("cond") ? JSON.parse(arg("cond")) : null;
let warnings = null;
if (cond) {
  const detail = {};
  if (cond.warning_kind) detail.warning_kind = cond.warning_kind;
  if (cond.warning_level) detail.warning_level = cond.warning_level;
  if (cond.keywords?.length) detail.keywords = cond.keywords;
  // 앱 조건 편집 창(CondModal)과 같은 꼴 — 사용자가 직접 넣은 조건
  if (cond.conditions?.length) detail.conditions = cond.conditions.map((x) => ({ ...x, source_type: "MANUAL" }));
  if (Object.keys(detail).length) qc.detail = detail;
  if (cond.reference_time) qc.reference_time = cond.reference_time;
  if (cond.period) qc.period = cond.period;
}
const body = { question_source: arg("source", "USER"), query_context: qc };
if (warnings) body.weather_warnings = warnings;

const t0 = Date.now();
const r = await askAsync(q, body);
const f = r.final ?? {};
const res = f.result ?? {};
const answer = res.answer ?? "";
const refs = (res.refs ?? []).map((x) => ({ ref: x.ref, name: x.display_name ?? x.name ?? null, type: x.entity_type ?? x.type ?? null, map: x.map ?? null }));
const cites = [...new Set((answer.match(/[^\n。.]*?(쪽|페이지|p\.\s?\d+|재해연보|재난연감|보고서|계획)[^\n。.]*/g) ?? []).map((s) => s.trim()).slice(0, 8))];
const dir = join(APP, "harness", "recordings", `demo_chain_${region}`);
mkdirSync(dir, { recursive: true });
const rec = { step, region, question: q, request: body, status: f.status ?? null, http: r.http ?? null, elapsedMs: f.meta?.elapsed_ms ?? null, waitedMs: r.waitedMs, at: new Date(t0).toISOString(), raw: f };
writeFileSync(join(dir, `${step}.json`), JSON.stringify(rec, null, 1));
console.log(`== ${step} · ${region} · ${f.status ?? (r.timeout ? "TIMEOUT" : "?")} · 처리 ${Math.round((f.meta?.elapsed_ms ?? 0) / 1000)}초 · 기다림 ${Math.round(r.waitedMs / 1000)}초 · 답 ${answer.length}자 · refs ${refs.length}`);
console.log(`질문: ${q}`);
console.log(`조건: ${JSON.stringify(qc)}`);
console.log("--- 답 원문 ---");
console.log(answer || "(답 없음)");
console.log("--- refs ---");
for (const x of refs) console.log(`${x.ref} · ${x.type ?? "-"} · ${x.name ?? "-"} · ${x.map ? `${x.map.key}=${x.map.value}` : "지도 없음"}`);
console.log("--- 정보 부족(data_gaps) ---");
console.log(JSON.stringify(res.data_gaps ?? f.data_gaps ?? [], null, 0).slice(0, 1500));
console.log("--- 경고(warnings) ---");
console.log(JSON.stringify(res.warnings ?? f.warnings ?? [], null, 0).slice(0, 800));
console.log("--- 근거 문서·쪽으로 보이는 문장 ---");
for (const c of cites) console.log(`· ${c}`);
console.log(`녹화: ${join(dir, `${step}.json`)}`);
