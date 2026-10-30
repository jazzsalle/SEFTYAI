// 시연 대본(docs/renewal/design/11_demo_day_story.md)의 «» 인용을 녹화 answer 원문과 기계로 대조한다.
// 쓰기: node harness/demo/check_story_quotes.mjs [대본 경로] [--list] [--rec <답 폴더>]   (옵션 순서 무관 · T3Q 를 부르지 않는다 — 녹화 파일만 읽음)
// 녹화 폴더: recordings/demo_chain_{busan,inje,yeongcheon} + recordings/demo_v3(v3 새 장면 — 파일 이름 = 단계 번호, YC-01-v3 = YC-01 새 질문 글) + aimode_*.json(지난 실시간 AI 모드)
// 규칙(대본 머리의 표지 규칙과 같다)
//  · «» 안 = 녹화 result.answer 원문. 빈칸·줄바꿈은 무시, 표 줄의 「\|」는 원문 「|」, 「…」는 생략(앞뒤 조각이 원문에 차례로 있어야 함).
//  · 어느 녹화와 견줄지: 그 줄에 나온 단계 번호(BS-01·IJ-05-R·YC-07b 등)와 그 줄이 든 단계 제목(##~####)의 단계 번호 → 둘 다 없으면 모든 녹화.
//  · 빈 «»(표지 규칙을 설명하는 글)는 인용으로 세지 않는다.
//    「AI 모드」가 든 줄·제목이면 AI 모드 녹화 답도 견준다.
//  · 인용 바로 앞(같은 표 칸 안, 인용보다 앞)에 단계 번호가 있으면 그 단계 답을 먼저 견준다. 거기 없고 같은 줄·제목의 다른 단계 답에만 있으면
//    「확인」으로 따로 적는다(불일치로 세지 않지만, 사람이 그 인용이 맞는 단계에 붙었는지 본다).
//  · 맞는 녹화가 견줄 대상에 없으면 불일치. 대상 밖 다른 녹화에만 있으면 「다른 단계 답」으로 따로 적는다(불일치로 셈).
//  · 견줄 대상에 v3 녹화(BS-07-v3 · YC-01-v3)가 있으면 같은 단계의 지난 녹화(BS-07 · YC-01)는 뺀다 — 단계 제목이 「BS-07(…)」·「YC-01(…)」이어도
//    지난 답에서 옮긴 인용이 일치로 지나가지 않게(지난 YC-01 은 정비 질문 — 결정 ①로 제외된 녹화).
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..", "..");
const REC = join(APP, "harness", "recordings");
const ARGS = process.argv.slice(2);
// --rec <폴더>: 그 폴더의 답만으로 견준다 — 리허설·예열 답(harness/e2e/rehearsal.mjs 가 남김, 파일 이름 = 단계 번호). 이 모드에서는
//  「-v3」를 뗀 이름으로 본다(BS-07-v3 → BS-07 · YC-01-v3 → YC-01 — 앱 묶음 질문이 v3 글이라 같은 단계), 그 폴더에 없는 단계의 인용은 「대상 답 없음」으로 따로 센다
const recAt = ARGS.indexOf("--rec");
const REC_ONLY = recAt >= 0 ? resolve(ARGS[recAt + 1] ?? ".") : null;
const STORY = resolve(ARGS.find((a, i) => !a.startsWith("--") && !(recAt >= 0 && i === recAt + 1)) ?? join(APP, "..", "docs", "renewal", "design", "11_demo_day_story.md"));
const AIMODE = join(REC, "aimode_2026-10-28T11-46-50-947Z.json");
const alias = (k) => (REC_ONLY ? k.replace(/-v3$/, "") : k);

/** 단계 번호 → answer 원문. 사슬 녹화(demo_chain_*) + v3 새 장면 녹화(demo_v3 — AIM-BS·AIM-IJ·AIM-YC·BRF-BS-1~4·BS-07-v3·YC-01-v3·YC-09, 파일 이름이 단계 번호) */
const answers = new Map();
const load = (dir) => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    answers.set(alias(f.replace(/\.json$/, "")), j.raw?.result?.answer ?? "");
  }
};
let aim = [];
if (REC_ONLY) load(REC_ONLY);
else {
  for (const d of ["demo_chain_busan", "demo_chain_inje", "demo_chain_yeongcheon", "demo_v3"]) load(join(REC, d));
  aim = JSON.parse(readFileSync(AIMODE, "utf8"));
  for (const r of aim) answers.set(`AIM:${r.id}`, r.answer ?? r.raw?.result?.answer ?? "");
}
/** AI 모드 답으로 치는 열쇠 — 지난 실시간 녹화(AIM:none·AIM:rain-warning)와 v3 시나리오 특보 녹화(AIM-BS·AIM-IJ·AIM-YC) */
const isAim = (k) => k.startsWith("AIM:") || k.startsWith("AIM-");

const norm = (s) => s.replace(/\\\|/g, "|").replace(/\s+/g, "");
const NORM = new Map([...answers].map(([k, v]) => [k, norm(v)]));

/** 조각들이 원문에 차례로 있는가 */
function inOrder(hay, parts) {
  let at = 0;
  for (const p of parts) {
    const i = hay.indexOf(p, at);
    if (i < 0) return false;
    at = i + p.length;
  }
  return true;
}
// 긴 이름(BS-07-v3 · YC-01-v3 · BRF-BS-n · AIM-xx)을 앞에 둔다 — 「BS-07-v3」가 「BS-07」로, 「YC-01-v3」가 「YC-01」로 잘려 잡히지 않게
const ID_RE = /\b(BS-07-v3|YC-01-v3|BRF-BS-[1-4]|AIM-(?:BS|IJ|YC)|BS-0[1-8]R?|IJ-0[1-7](?:-R)?|YC-0[1-9]b?)\b/g;
/** 글에 나온 단계 번호 전부(--rec 면 「-v3」 뗀 이름) · 그 가운데 견줄 답이 있는 것 */
const idsRaw = (s) => [...new Set((s.match(ID_RE) ?? []).map(alias))];
const idsIn = (s) => idsRaw(s).filter((x) => answers.has(x));

/** 인용 바로 앞(같은 표 칸 — 이스케이프 안 된 「|」 뒤부터 인용 앞까지, 앞선 인용 안은 빼고)에서 가장 가까운 단계 번호(raw = 견줄 답이 없는 번호도) */
function nearestId(line, at, raw = false) {
  let start = 0;
  for (let k = at - 1; k >= 0; k--) if (line[k] === "|" && line[k - 1] !== "\\") { start = k + 1; break; }
  const before = line.slice(start, at).replace(/«[^«»]*»/g, " ");
  // 「AI 모드」가 마지막 단계 번호보다 뒤에 있으면 AI 모드 답(AIM:*)을 바로 앞 대상으로 본다
  const ms = [...before.matchAll(new RegExp(ID_RE.source + "|AI 모드", "g"))].map((m) => (m[0] === "AI 모드" ? m[0] : alias(m[0]))).filter((k) => raw || k === "AI 모드" || answers.has(k));
  return ms.length ? ms[ms.length - 1] : null;
}

const lines = readFileSync(STORY, "utf8").split(/\r?\n/);
let headIds = [];
let headRaw = [];
let headAim = false;
const rows = [];
lines.forEach((line, i) => {
  if (/^#{2,4} /.test(line)) {
    headIds = idsIn(line);
    headRaw = idsRaw(line);
    headAim = /AI 모드/.test(line);
  }
  const qs = [...line.matchAll(/«([^«»]*)»/g)].map((m) => ({ q: m[1], at: m.index }));
  if (!qs.length) return;
  const lineIds = idsIn(line);
  const aimHere = /AI 모드/.test(line) || headAim;
  let cand = [...new Set([...lineIds, ...headIds])];
  if (aimHere) cand = [...cand, ...[...answers.keys()].filter(isAim)];
  // v3 녹화가 대상에 있으면 같은 단계의 지난 녹화는 뺀다(BS-07 → BS-07-v3 · YC-01 → YC-01-v3)
  const v3 = (k) => (cand.includes(`${k}-v3`) ? `${k}-v3` : k);
  cand = [...new Set(cand.map(v3))];
  const all = [...answers.keys()];
  for (const { q, at } of qs) {
    const parts = q.split("…").map(norm).filter(Boolean);
    if (!parts.length) continue;
    // --rec: 인용 바로 앞 단계(또는 그 줄·제목의 단계 전부)의 답이 이 폴더에 없으면 견주지 않고 따로 센다
    if (REC_ONLY) {
      const nr = nearestId(line, at, true);
      const named = [...new Set([...idsRaw(line), ...headRaw])];
      const gone = nr && nr !== "AI 모드" && !answers.has(nr) ? [nr] : !cand.length && named.length ? named : null;
      if (gone) { rows.push({ line: i + 1, q, skip: true, why: `이 폴더에 없는 단계 ${gone.join("·")}` }); continue; }
    }
    const pool = cand.length ? cand : all;
    const near = nearestId(line, at);
    const local = near && near !== "AI 모드" ? v3(near) : near;
    const hit = pool.filter((k) => inOrder(NORM.get(k), parts));
    if (local && hit.length && !(local === "AI 모드" ? hit.some(isAim) : hit.includes(local))) { rows.push({ line: i + 1, q, ok: true, hit, warn: `바로 앞 단계 ${local} 답에는 없고 ${hit.join("·")} 답에서 찾음` }); continue; }
    if (hit.length) { rows.push({ line: i + 1, q, ok: true, hit }); continue; }
    const elsewhere = all.filter((k) => inOrder(NORM.get(k), parts));
    // --rec: 못 찾았는데 그 줄·제목에 이 폴더에 없는 단계가 함께 적혀 있으면 그 단계의 인용일 수 있다 — 불일치로 세지 않고 따로
    const missing = REC_ONLY ? [...new Set([...idsRaw(line), ...headRaw])].filter((k) => !answers.has(k)) : [];
    if (!elsewhere.length && missing.length) { rows.push({ line: i + 1, q, skip: true, why: `견준 ${pool.join("·")} 답에 없음 — 이 폴더에 없는 단계 ${missing.join("·")} 의 인용일 수 있음` }); continue; }
    rows.push({ line: i + 1, q, ok: false, why: elsewhere.length ? `다른 단계 답(${elsewhere.join("·")})에만 있음 — 견준 대상 ${pool.length === all.length ? "전체" : pool.join("·")}` : "어느 녹화 answer 에도 없음", cand: pool.length === all.length ? "전체" : pool.join("·") });
  }
});

const skip = rows.filter((r) => r.skip);
const bad = rows.filter((r) => !r.ok && !r.skip);
const warn = rows.filter((r) => r.warn);
console.log(`대본: ${STORY}`);
if (REC_ONLY) console.log(`답: ${REC_ONLY} — ${[...answers.keys()].sort().join(" ")}`);
else console.log(`녹화: 사슬·v3 ${[...answers.keys()].filter((k) => !isAim(k)).length}개 · AI 모드 ${[...answers.keys()].filter(isAim).length}개(지난 실시간 ${aim.length} · v3 시나리오 ${[...answers.keys()].filter((k) => k.startsWith("AIM-")).length})`);
console.log(`«» 인용 ${rows.length}개 · 일치 ${rows.length - bad.length - skip.length}(그중 확인 ${warn.length}) · 불일치 ${bad.length}${REC_ONLY ? ` · 대상 답 없음 ${skip.length}` : ""}`);
for (const r of warn) console.log(`  L${r.line} 확인 — ${r.warn}\n    «${r.q.slice(0, 120)}${r.q.length > 120 ? "…" : ""}»`);
for (const r of bad) console.log(`  L${r.line} 불일치 — ${r.why}\n    «${r.q.slice(0, 160)}${r.q.length > 160 ? "…" : ""}»`);
if (ARGS.includes("--list")) for (const r of skip) console.log(`  L${r.line} 대상 답 없음 — ${r.why} «${r.q.slice(0, 60)}»`);
if (ARGS.includes("--list")) for (const r of rows.filter((x) => x.ok)) console.log(`  L${r.line} 일치(${r.hit.join("·")}) «${r.q.slice(0, 60)}»`);
process.exit(bad.length ? 1 : 0);
