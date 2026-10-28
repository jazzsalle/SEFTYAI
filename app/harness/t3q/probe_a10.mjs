// 하네스 — 승인 A10(유사사례 목록의 사건마다 사건 상세를 함께 받아 사건 요약을 보임) 실측·녹화.
// 유사사례 검색(T3Q-04, 앱 자동 조회와 같은 꼴: 20건) → 목록 사건 전부의 사건 상세(T3Q-10)를 동시에 → 시간·요약 유무, 녹화본 저장
// node harness/t3q/probe_a10.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP, t3q } from "./client.mjs";

const rec0 = JSON.parse(readFileSync(join(APP, "harness", "recordings", "data_2026-10-27T15-53-38-514Z.json"), "utf8"));
const qc = rec0.find((x) => x.path === "/similar-events/search" && x.body?.query_context).body.query_context; // 부산·호우(시안 A 와 같은 조건)
const recs = [];
const sBody = { query_context: qc, page: { page: 1, size: 20 } };
const s = await t3q("POST", "/similar-events/search", sBody);
recs.push({ method: "POST", path: "/similar-events/search", body: sBody, response: s.json });
const items = s.json?.result?.items ?? [];
console.log(`유사사례 검색 HTTP ${s.http} · ${s.ms}ms · ${items.length}건(전체 ${s.json?.result?.total_count})`);

async function details(list, label) {
  const t0 = Date.now();
  const ds = await Promise.all(list.map((it) => t3q("GET", `/events/${encodeURIComponent(it.event_master_id)}`)));
  const wall = Date.now() - t0;
  const ms = ds.map((d) => d.ms).sort((a, b) => a - b);
  console.log(`${label}: 사건 상세 ${ds.length}건 동시 — 다 받기까지 ${wall}ms · 건당 중앙값 ${ms[Math.floor(ms.length / 2)]}ms · 최대 ${ms.at(-1)}ms · 실패 ${ds.filter((d) => d.http !== 200).length} · 사건 요약 있음 ${ds.filter((d) => d.json?.result?.event_summary).length}`);
  return ds;
}
const all = await details(items, "전부");
all.forEach((d, i) => recs.push({ method: "GET", path: `/events/${items[i].event_master_id}`, body: null, response: d.json }));
await details(items.slice(0, 10), "앞 10건");

for (const [i, it] of items.entries()) {
  const sum = all[i].json?.result?.event_summary ?? "(요약 없음)";
  console.log(`  ${String(it.similarity?.rank ?? i + 1).padStart(2)}위 ${it.display_name} — ${String(sum).slice(0, 70)}`);
}
const out = join(APP, "harness", "recordings", `a10_similar_details_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify(recs, null, 1));
console.log("녹화:", out.slice(APP.length + 1));
