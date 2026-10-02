// 추천 질의·연속 질의·조건 시나리오 전수 점검 : node scripts/library.mjs [baseUrl]
const BASE = process.argv[2] || "http://localhost:3100";
const call = async (region, q, extra = {}) => {
  const r = await fetch(`${BASE}/api/agent/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: "lib", question: q, presetKey: extra.preset, context: { region, disasterType: extra.dt ?? "호우", baseTime: extra.baseTime ?? "2026-10-03T09:00:00+09:00", mode: "scenario", refEntity: extra.ref, hydro: extra.hydro, scenarioId: extra.scenarioId, keywords: extra.keywords, prevCheckAt: extra.prev } }) });
  return r.json();
};
const head = (j) => (j.blocks?.find((b) => b.kind === "headline")?.text ?? JSON.stringify(j).slice(0, 200)).replace(/\{\{e:([^}]+)\}\}/g, (_, id) => `‹${j.entities?.find((e) => e.id === id)?.name ?? id}›`).replace(/\[\[c\d+\]\]/g, "");
let bad = 0;
const show = (tag, q, j) => { const clar = j.intent === "clarify" || !j.blocks; if (clar) bad++; console.log(`${clar ? "✗" : "✓"} ${tag} [${j.intent}] ${q}\n    ${head(j).slice(0, 260)}`); };
const only = process.argv[3];
for (const region of ["busan", "yeongcheon", "inje", "national"]) {
  const s = await (await fetch(`${BASE}/api/scenarios?region=${region}`)).json();
  if (!only || only === "lib") for (const it of s.library) show(`${region} ${it.id}`, it.q, await call(region, it.q, { preset: it.preset }));
  if (!only || only === "flow") for (const f of s.flows) {
    console.log(`\n▶ FLOW ${region} ${f.title}`);
    const sc = s.conditions.find((c) => c.id === f.scenarioId);
    let ref;
    for (const q of f.steps) {
      const j = await call(sc && sc.region !== "national" ? sc.region : region, q, { ref, hydro: sc?.hydro, scenarioId: sc?.id, keywords: sc?.keywords, dt: sc?.disasterType });
      show("  ", q, j);
      if (j.focusEntity) ref = { type: j.focusEntity.type, id: j.focusEntity.id, name: j.focusEntity.name };
    }
  }
  if (!only || only === "check") {
    let prev;
    for (const st of s.checkSteps) { const j = await call(region, "상황점검", { preset: "check", baseTime: st.at, prev }); show(`CHECK ${st.label}`, st.at, j); prev = st.at; }
  }
}
console.log(`\n${bad} clarify/error`);
