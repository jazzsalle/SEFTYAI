// 녹화된 답의 refs 가 EXT-01(공간객체 도형)에서 실제로 찾아지는지 키별로 센다.
// node harness/t3q/probe_geo_cover.mjs <녹화 폴더>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { t3q } from "./client.mjs";
const dir = process.argv[2];
const items = [];
for (const f of readdirSync(dir)) {
  const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
  for (const r of j.final?.result?.refs ?? []) items.push({ ref: `${f}:${r.ref}`, key: r.map?.key, value: String(r.map?.value) });
}
const by = {};
for (let i = 0; i < items.length; i += 300) {
  const chunk = items.slice(i, i + 300);
  const r = await t3q("POST", "/spatial-objects/geometry", { items: chunk });
  const miss = new Set((r.json?.result?.missing ?? []).map((m) => m.ref));
  const prec = {};
  for (const ft of r.json?.result?.features ?? []) prec[ft.properties.ref] = ft.properties.precision;
  for (const it of chunk) {
    const b = (by[it.key] ??= { total: 0, found: 0, missing: 0, precision: {} });
    b.total++;
    if (miss.has(it.ref)) b.missing++;
    else { b.found++; const p = prec[it.ref] ?? "?"; b.precision[p] = (b.precision[p] ?? 0) + 1; }
  }
}
console.log(JSON.stringify(by, null, 1));
