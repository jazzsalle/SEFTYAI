// 미확인 계약 실측: 도형 키(SL-/LS-/HZ-/UP-), 취소 빈 본문, 위험 목록의 spatial_object_id 꼴
import { t3q, save } from "./client.mjs";
const out = {};
const risk = await t3q("POST", "/risk-knowledge/search", { query_context: { region: { admin_code: "5181000000", level: "SIGUNGU", name: "인제군" } }, page: { page: 1, size: 30 } });
out.risk = risk.json;
const items = risk.json?.result?.items || [];
console.log("risk", risk.http, risk.json?.status, items.length, JSON.stringify(items.slice(0, 2)).slice(0, 700));
const ids = [...new Set(items.map((i) => i.spatial_object_id || i.object_id).filter(Boolean))].slice(0, 12);
console.log("ids", ids);
const g = await t3q("POST", "/spatial-objects/geometry", { items: ids.map((v, i) => ({ ref: "x" + i, key: "spatial_object_id", value: v })) });
console.log("geom spatial_object_id", g.json?.status, "features", g.json?.result?.features?.length, "missing", JSON.stringify(g.json?.result?.missing).slice(0, 400));
out.geom = g.json;
const c1 = await t3q("POST", "/agent/query/REQ-NOPE/cancel");
console.log("cancel no body", c1.http, JSON.stringify(c1.json || c1.text).slice(0, 200));
const c2 = await t3q("POST", "/agent/query/REQ-NOPE/cancel", { reason: "USER_CANCELLED" });
console.log("cancel body", c2.http, JSON.stringify(c2.json?.result));
const p = await t3q("GET", "/agent/query/REQ-NOPE");
console.log("poll unknown", p.http, JSON.stringify(p.json?.result));
console.log(save("recordings/unknowns_" + Date.now() + ".json", out));
