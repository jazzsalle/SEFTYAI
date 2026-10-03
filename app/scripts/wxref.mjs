// 특보 참조 질의 회귀 점검 : node scripts/wxref.mjs [baseUrl]
// [특보로 질문]으로 건 특보(훈련 시나리오 발효 특보)와 함께 자연어 질문을 보내고, 기대 의도와 다르면 FAIL
const BASE = process.argv[2] || "http://localhost:3100";
const CASES = [
  // [특보 종류, 단계, 지역, 질문, 기대 의도, presetKey?]
  ["호우", "경보", "busan", "이 특보는 어떤 기준이고 언제 격상됐나요?", "advisory"],
  ["호우", "경보", "busan", "현재 특보에서 우선 확인해야 할 위험·취약지역은?", "risk"],
  ["호우", "경보", "busan", "현재 상황과 유사한 과거 재난사례는?", "similar"],
  ["호우", "경보", "busan", "이 상황에서 행동매뉴얼상 확인해야 할 대응절차는?", "manual"],
  ["호우", "경보", "busan", "이 특보 언제 끝나?", "advisory"],
  ["호우", "경보", "yeongcheon", "이 특보 기준을 이미 넘었나요?", "advisory"],
  ["호우", "경보", "yeongcheon", "주민 대피가 필요할까?", "evacuation"],
  ["호우", "경보", "inje", "계곡 야영객 철수가 필요한가요?", "control"],
  ["풍랑", "주의보", "busan", "이 특보 기준이 뭐야?", "advisory"],
  ["풍랑", "주의보", "busan", "어디가 제일 위험해?", "advisory-risk"],
  ["풍랑", "주의보", "busan", "과거에도 이런 적 있었어?", "advisory-case"],
  ["풍랑", "주의보", "busan", "주민 대피가 필요할까?", "advisory-act"],
  ["풍랑", "주의보", "busan", "재난문자 보내야 하나?", "message"],
  ["풍랑", "주의보", "busan", "위험·취약지역", "advisory-risk", "qq-risk"],
  ["산사태", "주의보", "inje", "이 특보는 어떤 기준이고 언제 발표됐나요?", "advisory"],
  ["산사태", "주의보", "inje", "현재 특보에서 우선 확인해야 할 위험·취약지역은?", "risk"],
  ["산사태", "주의보", "inje", "과거에도 산사태 피해가 있었나요?", "advisory-case"],
  ["산사태", "주의보", "inje", "지금 뭐부터 해야 해?", "advisory-act"],
  ["산사태", "주의보", "inje", "행동매뉴얼 대응절차", "advisory-act", "qq-act"],
];
const w = await (await fetch(`${BASE}/api/weather?region=national&mode=scenario`)).json();
let fail = 0;
for (const [type, level, regionId, q, want, preset] of CASES) {
  const adv = w.advisories.find((a) => a.type === type && a.level === level && a.regionId === regionId && a.status === "발효");
  if (!adv) { fail++; console.log(`FAIL 특보 없음 ${type}${level} ${regionId}`); continue; }
  const r = await fetch(`${BASE}/api/agent/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "wxref", question: q, presetKey: preset, context: { region: "national", disasterType: "호우", baseTime: "2026-10-03T09:00:00+09:00", mode: "scenario", refAdvisory: { id: adv.id, type, level, area: adv.area, issuedAt: adv.issuedAt, regionId } } }),
  });
  const j = await r.json();
  const ok = r.ok && j.intent === want;
  if (!ok) fail++;
  const head = (j.blocks?.find((b) => b.kind === "headline")?.text ?? "").replace(/\{\{e:([^}]+)\}\}/g, (_, id) => `‹${j.entities?.find((e) => e.id === id)?.name ?? id}›`).replace(/\[\[c\d+\]\]/g, "").replace(/\*\*/g, "");
  console.log(`${ok ? "PASS" : "FAIL"} [${type}${level}·${regionId}] ${q}\n   intent=${j.intent} want=${want}\n   ▶ ${head.slice(0, 200)}\n`);
}
console.log(fail ? `\n${fail} FAIL` : "\nALL PASS");
process.exit(fail ? 1 : 0);
