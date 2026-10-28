// 실측: Data API 예시(t3q_examples.json, Agent 제외) 전부를 한 번씩 불러 상태·시간·결과 크기를 기록한다.
// node harness/t3q/probe_data.mjs → harness/recordings/data_<시각>.json
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP, save, t3q } from "./client.mjs";

const ex = JSON.parse(readFileSync(join(APP, "..", "docs", "renewal", "analysis", "t3q_examples.json"), "utf8"));
const list = [...ex.examples, ...(ex.derived || [])].filter((a) => a.kind !== "Agent" && a.method && a.method !== "-" && a.path);
const out = [];
for (const a of list) {
  const path = a.path.replace(/^\/v1/, "") + (a.query ? "?" + new URLSearchParams(a.query) : "");
  const r = await t3q(a.method, path, a.method === "GET" ? undefined : a.body);
  const res = r.json?.result;
  const n = Array.isArray(res?.items) ? res.items.length : Array.isArray(res?.features) ? res.features.length : null;
  console.log(`${a.id.padEnd(8)} ${a.method.padEnd(6)} ${r.http} ${String(r.json?.status).padEnd(18)} ${String(r.ms).padStart(5)}ms items=${n ?? "-"} ${path}`);
  out.push({ id: a.id, method: a.method, path, body: a.body, http: r.http, ms: r.ms, response: r.json ?? r.text });
}
console.log(save(`recordings/data_${new Date().toISOString().replace(/[:.]/g, "-")}.json`, out));
