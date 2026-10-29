// 하네스 — T3Q 스트리밍 확인 2: 명세 경로 전체·질의 응답 칸, 비동기 결과 조회 중 부분 답이 오는지(1초 간격)
// node harness/t3q/probe_stream2.mjs   (토큰은 출력하지 않는다)
import { loadEnv, t3q, sleep } from "./client.mjs";

const { base, token } = loadEnv();
const origin = base.replace(/\/v\d+$/, "");
const r = await fetch(`${origin}/openapi.json`, { headers: { Authorization: `Bearer ${token}` } });
const spec = await r.json();
console.log("명세", spec.info?.title, spec.info?.version);
for (const [p, v] of Object.entries(spec.paths)) console.log(" ", Object.keys(v).map((m) => m.toUpperCase()).join(","), p, "—", Object.values(v)[0]?.summary ?? "");
// 질의 요청·응답 스키마에서 response_mode·stream·partial·progress 같은 칸
const sch = spec.components?.schemas ?? {};
for (const [name, s] of Object.entries(sch)) {
  const txt = JSON.stringify(s);
  if (/response_mode|stream|partial|progress|chunk|delta|token/i.test(txt)) {
    const props = Object.keys(s.properties ?? {});
    console.log(`스키마 ${name}:`, props.join(", ").slice(0, 400));
    const rm = s.properties?.response_mode;
    if (rm) console.log("   response_mode:", JSON.stringify(rm).slice(0, 300));
  }
}

// 비동기 접수 → 1초 간격 조회: 처리 중 응답에 부분 답·진행 칸이 있는지
const Q = "부산광역시 지하차도 가운데 하천에서 500m 안에 있는 곳은 몇 곳이야?";
const t0 = Date.now();
const sub = await t3q("POST", "/agent/query", { question: Q, question_source: "USER", response_mode: "ASYNC", query_context: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" } } });
console.log(`\n접수 HTTP ${sub.http} ${sub.ms}ms · 칸: ${Object.keys(sub.json ?? {}).join(", ")} · result 칸: ${Object.keys(sub.json?.result ?? {}).join(", ")}`);
const rid = sub.json?.result?.request_id || sub.json?.request_id;
let lastShape = "";
for (let i = 0; i < 240 && rid; i++) {
  await sleep(1000);
  const g = await t3q("GET", `/agent/query/${rid}`);
  const j = g.json ?? {};
  const res = j.result ?? {};
  const ans = typeof res.answer === "string" ? res.answer : "";
  const shape = `HTTP ${g.http} status=${j.status} result칸=[${Object.keys(res).join(",")}] 답길이=${ans.length} 기타=[${Object.keys(j).filter((k) => !["result", "status"].includes(k)).join(",")}]`;
  if (shape !== lastShape) {
    console.log(`+${((Date.now() - t0) / 1000).toFixed(1)}s ${shape}${ans ? ` · 앞부분: ${ans.replace(/\s+/g, " ").slice(0, 120)}` : ""}`);
    const extra = Object.fromEntries(Object.entries(j).filter(([k]) => /partial|progress|stage|step|eta|chunk|delta|stream/i.test(k)));
    if (Object.keys(extra).length) console.log("   부분·진행 칸:", JSON.stringify(extra).slice(0, 400));
    const rextra = Object.fromEntries(Object.entries(res).filter(([k]) => /partial|progress|stage|step|eta|chunk|delta|stream/i.test(k)));
    if (Object.keys(rextra).length) console.log("   result 부분·진행 칸:", JSON.stringify(rextra).slice(0, 400));
    lastShape = shape;
  }
  if (g.http !== 202) break;
}
console.log(`끝 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
