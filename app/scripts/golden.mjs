// 골든 질문 회귀 점검 : node scripts/golden.mjs [baseUrl]
// 각 질문의 의도(intent)·헤드라인·블록 구성을 확인하고, 기대 의도와 다르면 FAIL
const BASE = process.argv[2] || "http://localhost:3100";
const CASES = [
  ["busan", "현재 상황 브리핑", "briefing", "briefing"],
  ["busan", "부산 급경사지는 어디 있고, 왜·언제 위험한가요?", "risk"],
  ["busan", "시간당 60mm 안팎일 때 과거 부산 어디가 침수됐나요?", "similar"],
  ["busan", "호우경보가 발효됐는데 자연재난과 담당자인 제가 지금 해야 할 일은?", "manual"],
  ["busan", "온천천 하상도로는 언제 통제해야 하나요?", "river"],
  ["busan", "부산 지하차도 침수 이력과 통제 기준", "risk"],
  ["busan", "이번 사건으로 접수된 119 신고 내용은 무엇인가요?", "report119"],
  ["busan", "2020년 7월 23일 부산 호우 때 무슨 일이 있었나요?", "event"],
  ["busan", "태풍 힌남노 때 부산 피해는?", "event"],
  ["busan", "피해 신고가 들어오면 어떤 절차인가요?", "manual"],
  ["busan", "지금 우리 지역 기상특보와 강우 상황은 어떤가요?", "weather"],
  ["yeongcheon", "영천 위험저수지는 어디 있고 왜 위험한가요?", "risk"],
  ["yeongcheon", "금호강 주변 위험지역과 과거 피해는?", "river"],
  ["yeongcheon", "호우경보 발효 시 안전재난하천과가 지금 해야 할 일은?", "manual"],
  ["yeongcheon", "영천 지하차도 통제 기준과 대상은?", "risk"],
  ["inje", "인제 계곡 야영장 중 먼저 철수시킬 곳은 어디인가요?", "risk"],
  ["inje", "내린천 주변 위험 구간과 대응은?", "river"],
  ["inje", "인제 산사태 취약지역은 어디고 언제 대피해야 하나요?", "risk"],
  ["inje", "2013년 7월 인제 호우 때 어떤 피해가 있었나요?", "event"],
  ["national", "시범 3개 지역 급경사지 현황을 비교해 주세요", "risk"],
  ["national", "이번 호우로 접수된 119 신고 현황은?", "report119"],
  ["busan", "점심 메뉴 추천해줘", "clarify"],
];
let fail = 0;
for (const [region, q, want, preset] of CASES) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/agent/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "golden", question: q, presetKey: preset, context: { region, disasterType: "호우", baseTime: "2026-10-03T09:00:00+09:00", mode: "scenario" } }),
  });
  const j = await r.json();
  const ok = r.ok && j.intent === want;
  if (!ok) fail++;
  const head = (j.blocks?.find((b) => b.kind === "headline")?.text ?? JSON.stringify(j.error ?? j)).replace(/\{\{e:([^}]+)\}\}/g, (_, id) => `‹${j.entities?.find((e) => e.id === id)?.name ?? id}›`).replace(/\[\[c\d+\]\]/g, "");
  console.log(`${ok ? "PASS" : "FAIL"} [${region}] ${q}\n   intent=${j.intent} want=${want} blocks=${j.blocks?.map((b) => b.kind).join(",")} ents=${j.entities?.length} cites=${j.citations?.length} ${Date.now() - t0}ms\n   ▶ ${head.slice(0, 330)}\n`);
}
console.log(fail ? `\n${fail} FAIL` : "\nALL PASS");
process.exit(fail ? 1 : 0);
