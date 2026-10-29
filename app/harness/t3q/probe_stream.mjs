// 하네스 — T3Q 스트리밍 지원 확인: 서버 버전·명세(openapi)에서 스트리밍 경로를 찾고, 짧은 질문 하나로 SSE 응답이 실제로 조각조각 오는지 잰다.
// node harness/t3q/probe_stream.mjs   (토큰은 출력하지 않는다)
import { loadEnv, t3q } from "./client.mjs";

const { base, token } = loadEnv();
const origin = base.replace(/\/v\d+$/, "");
const out = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`.slice(0, 1200));

// 1) 버전·상태
const h = await t3q("GET", "/health").catch((e) => ({ http: 0, text: String(e) }));
out("health", { http: h.http, body: h.json ?? h.text });

// 2) 명세에서 stream 이 들어간 경로·칸 찾기
for (const p of [`${origin}/openapi.json`, `${base}/openapi.json`, `${origin}/v1/openapi.json`]) {
  try {
    const r = await fetch(p, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch {}
    if (!j?.paths) { out(`openapi ${p.replace(origin, "")}`, `${r.status} (명세 아님)`); continue; }
    out(`openapi ${p.replace(origin, "")}`, `${r.status} · ${j.info?.title ?? ""} ${j.info?.version ?? ""} · 경로 ${Object.keys(j.paths).length}개`);
    const hits = Object.entries(j.paths).filter(([k, v]) => /stream|sse/i.test(k) || /stream|event-stream|sse/i.test(JSON.stringify(v)));
    out("  stream 관련 경로", hits.map(([k, v]) => `${k} [${Object.keys(v).join(",")}]`));
    const s = JSON.stringify(j.components?.schemas ?? {});
    const modes = [...new Set((s.match(/"(ASYNC|SYNC|STREAM|SSE)"/g) ?? []))];
    out("  response_mode 값", modes);
    break;
  } catch (e) {
    out(`openapi ${p.replace(origin, "")}`, `오류 ${e.message}`);
  }
}

// 3) 실제 스트리밍 시험 — 짧은 질문(특보 없는 AI 모드 점검 꼴, 지난 실측 9초)
const Q = "제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 먼저 확인할 내용을 알려 주십시오. 발효 중인 특보가 없으면 대응 검토가 필요한 사유를 확인하지 못했다는 점검 결과만 1문장으로 쓰십시오.";
const body = (extra) => JSON.stringify({ question: Q, question_source: "USER", query_context: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" } }, ...extra });
async function tryStream(label, path, extra) {
  const t0 = Date.now();
  try {
    const r = await fetch(base + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8", Accept: "text/event-stream" },
      body: body(extra),
      signal: AbortSignal.timeout(240000),
    });
    const ct = r.headers.get("content-type") ?? "";
    out(`\n[${label}] ${path}`, `HTTP ${r.status} · content-type ${ct} · 첫 응답 ${Date.now() - t0}ms`);
    if (!/event-stream/.test(ct)) {
      const t = await r.text();
      out("  본문(앞부분)", t.slice(0, 400));
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", n = 0, first = null, names = {}, last = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const ev = buf.slice(0, i);
        buf = buf.slice(i + 2);
        n++;
        const name = ev.match(/^event:\s*(.+)$/m)?.[1] ?? "(message)";
        names[name] = (names[name] ?? 0) + 1;
        if (first == null) first = Date.now() - t0;
        if (n <= 6 || /final|done|end|error/i.test(name)) out(`  +${Date.now() - t0}ms ${name}`, ev.replace(/^event:.*$/m, "").replace(/\s+/g, " ").slice(0, 220));
        last = ev;
      }
    }
    out("  요약", { 사건수: n, 첫사건ms: first, 끝ms: Date.now() - t0, 사건종류: names });
    out("  마지막 사건(앞부분)", last.slice(0, 300));
  } catch (e) {
    out(`[${label}] ${path}`, `오류 ${e.message} (${Date.now() - t0}ms)`);
  }
}
await tryStream("A response_mode STREAM", "/agent/query", { response_mode: "STREAM" });
await tryStream("B /agent/query/stream", "/agent/query/stream", {});
