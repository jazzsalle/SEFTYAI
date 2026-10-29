// 하네스 — 지난 실측 녹화 분석(시연 준비 B). 녹화 파일만 읽는다 — T3Q 호출 없음.
// node --no-warnings harness/demo/analyze_recordings.mjs [--dirs cq_…,regional_…] [--out <json>]
//  (--no-warnings: library.ts 를 ESM 으로 다시 읽는다는 Node 경고만 숨긴다)
//  입력: harness/recordings/<dir>/*.json (원응답 그대로) · harness/cq/cq_variants.json · harness/cq/regional_questions.json · src/lib/library.ts(읽기만)
//  출력: docs/renewal/analysis/demo_day/B_recordings.json — 문항별 처리 시간·질문 모양·조건·refs·근거 인용·data_gaps + 묶음 집계
// 시간 = final.meta.elapsed_ms(T3Q 쪽 처리 시간). waitedMs(하네스 3초 결과 조회 포함 벽시계)는 참고로 같이 둔다.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..", "..");
const REPO = join(APP, "..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DIRS = arg("dirs", "cq_2026-10-27T16-29-27-437Z,regional_2026-10-27T17-46-51-490Z").split(",").filter(Boolean);
const OUT = arg("out", join(REPO, "docs", "renewal", "analysis", "demo_day", "B_recordings.json"));

const FAST_MS = 90_000; // 빠른 문항: 90초 이하
const SLOW_MS = 180_000; // 느린 문항: 180초 이상

// ── 질문 메타 ──
const CQ = Object.fromEntries(JSON.parse(readFileSync(join(APP, "harness", "cq", "cq_variants.json"), "utf8")).map((x) => [x.id, x]));
const REG = Object.fromEntries(JSON.parse(readFileSync(join(APP, "harness", "cq", "regional_questions.json"), "utf8")).map((x) => [x.id, x]));
let LIB = {};
try {
  const m = await import("../../src/lib/library.ts"); // Node 24 타입 제거 — 읽기만 한다
  LIB = Object.fromEntries(m.LIBRARY.map((q) => [q.id, q]));
} catch (e) {
  console.warn("library.ts 를 읽지 못했다(preview 칸은 비운다):", e.message);
}

// templates.md «원문 근거» 열 — 역량질문 변형이 어느 질문 템플릿에서 왔는지
const TEMPLATE_OF_CQ = {
  T01: ["A-03-v1", "A-03-v2"], T02: ["P07-01-v1", "P07-01-v2"], T03: ["P07-04-v1", "P07-04-v2"], T04: ["B-08-v1"], T05: ["A-16-v1"],
  T06: ["P09-01-v1"], T07: ["PT-04-v1", "PT-04-v2"], T08: ["P07-02-v1"], T09: ["P07-03-v1"], T10: ["A-05-v2"], T11: ["A-05-v1"],
  T12: ["A-02-v1", "A-02-v2"], T13: ["P08-03-v1"], T14: ["PT-01-v1"], T15: ["P06-07-v1", "P06-07-v2", "A-26-v1"], T16: ["D-01-v2", "A-26-v2"],
  T17: ["D-01-v1"], T18: ["P01-03-v1", "P01-03-v2"], T19: ["A-27-v1", "A-14-v1"], T20: ["A-25-v1", "A-25-v2", "C-06-v1", "C-06-v2"],
  T21: ["P02-04-v1", "P02-04-v2"], T22: ["P02-01-v1", "P02-01-v2"], T23: ["P02-02-v1", "P02-02-v2"], T24: ["C-01-v1", "C-01-v2", "C-08-v1", "D-07-v1"],
  T25: ["B-19-v1", "B-19-v2"], G01: ["A-02-g"], G02: ["A-05-g"], G03: ["A-14-g1", "A-14-g2"], G04: ["A-16-g"], G05: ["A-03-g"], G06: ["B-08-g"],
  G07: ["D-07-g"], G08: ["P09-02-g1", "P09-02-g2"], G09: ["P09-03-g", "P09-03-v2"], G10: ["P09-04-g1", "P09-04-g2"], G11: ["P09-01-g"],
  G12: ["P08-03-g"], G13: ["PT-01-g"], G14: ["C-08-g"],
};
const CQ_TEMPLATE = Object.fromEntries(Object.entries(TEMPLATE_OF_CQ).flatMap(([t, ids]) => ids.map((id) => [id, t])));

// ── 질문 모양: 질문 글에 나온 «대상 데이터 종류» (우리 분류 — 정규식은 아래 그대로 JSON 범례에 남긴다) ──
const KINDS = {
  // «산사태취약지역»·«재해위험등급(지하차도)»은 위험지구로 세지 않는다
  위험지구: /위험지구|개선지구|정비지구|홍수취약지구|붕괴위험지|위험·취약|재해위험(?!\s?등급|도)|법정\s?위험|(?<!산사태)취약지역|인명피해\s?우려/,
  급경사지: /급경사지/,
  산사태취약지역: /산사태|토석류/,
  지하차도: /지하차도/,
  침수흔적: /침수흔적|침수됐던|침수\s?이력|침수된/,
  상습침수: /상습침수/,
  침수지도: /침수지도|침수심|범람지도/,
  "사건·피해·복구": /(?<!인명)피해|복구|사건(?!\s?연도별)|사례|이재민/,
  "계획·사업": /정비사업|정비계획|사업\s?내용|저감대책|시행기관|계획돼/,
  "특보·문자·관측소": /재난문자|홍수특보|홍수주의보|기상특보|대설특보|호우특보|관측소|대응수위|특보\s?이력/,
  "하천·소하천": /하천(?!범람)|미호강/,
  "건축물·주택·시설점": /건축물|주택(?!\s?침수\s?피해)|집은|지하층|반지하|숙박시설|야영장|캠핑/,
  도로: /도로/,
  "GeoAI 침수구역": /GeoAI|홍수탐지/,
  행동매뉴얼: /매뉴얼/,
};
/** 대상 종류를 셀 때 지도 종류 나열 괄호(«(도시침수·하천범람)» 등)는 뺀다 — 데이터 종류가 아니라 지도 구분이라서 */
const stripMapTypeParen = (q) => q.replace(/\([^)]*도시침수[^)]*\)/g, "");
const SPATIAL_RADIUS = /(\d+)\s*m\s*(?:안|이내|내)|반경\s*(\d+)/;
const SPATIAL_OVERLAP = /겹치|겹쳐|중첩|안에\s*(?:있|들|드)|에\s*드는|드는|들어가는|범위\s*안|구역\s*안|구역에\s*있|구역이\s*있|걸친|함께\s*있는|두\s*제도\s*이상/;
const AREA = /면적/;
const YEAR = /(?:19|20)\d{2}(?=\s*[년·)~]|$|\s)/g;
const MONTH_DAY = /\d{1,2}\s*월|\d{1,2}\s*일|\d{1,2}\s*~\s*\d{1,2}\s*일|\d{1,2}\s*시/;
const BY_YEAR = /연도별|몇\s*년도|해와|연도/;
const PAST = /과거|이력|있었던|됐던|났던|실제로/;
const NOWISH = /지금|현재|발효되면|가정하면|내려진|났다고/;
// 질문 글에 넣은 «지금 특보 상황» 가정(조건). «특보가 발효된 날 보낸 문자» 같은 데이터 조건은 뺀다
const TEXT_WARNING = /(?:경보|주의보|특보)(?:가|이)?\s*(?:발효되면|내려진|내려지면|났다고)|발효되면|가정하면/;
const BREAKDOWN = /([가-힣]+)별/g; // «…별» 쪼개기 — «특별(자치도)» 는 뺀다
const RANKING = /순으로|우선순위|상위|많은\s?(?:순|읍면|법정동|동|곳)|가장|최장|\d+\s*곳/;
const COUNT_ASK = /몇|개수|건수|\s수와|\s수를|면적/;
const SUMMARY_ASK = /정리해줘|현황|종합/;
const SUBUNIT_STOP = new Set(["도면", "면적", "이동", "활동", "행동", "자동", "공동", "단독", "법정동", "읍면", "지하층", "전면", "측면", "방면", "화면", "어느 읍면", "많은 동", "각 동", "동", "리", "면"]);
const SUBUNIT = /([가-힣]{1,4}(?:읍|면|동|리))(?=[\s«»·,()은는이가을를의에와과도만?]|$)/g;
const WIDE_SCOPE = /시도별|여러\s*시도|전국/;

// ── 근거 인용(답 글) ──
const PAGE = /(\d+\s*쪽|쪽\s*\d+|\d+\s*페이지|페이지\s*\d+|\bpp?\.\s?\d+)/gi;
const TASK_RE = /쪽|페이지|p\.\s?\d|재해연보|재난연감|보고서|계획/g; // 과업 지시의 예시 정규식 그대로(넓음 — «계획홍수위» 같은 낱말도 잡힌다)
const DOC_NAME = /(재해연보|재난연감|[가-힣]*보고서|[가-힣]*총괄조서|[가-힣]*중기\s?정비\s?계획|[가-힣]*정비\s?계획|[가-힣]*종합\s?계획|[가-힣]*저감\s?계획|하천기본계획|[가-힣]*매뉴얼|[가-힣]*지침)/g;
const SOURCE_LINE = /출처|근거\s*(?:데이터|자료|출처)|산출\s*근거/;
const HEADING = /^\s*(?:#{1,6}\s|\*\*[^*]+\*\*\s*$)/;
const DB_TABLE = /\b(?:mois_struct152|(?:hazard|flood|slope|disaster|alert|gis|ref|bldg|intl)\.[a-z_][a-z0-9_]*)/g;

function sourceBlock(answer) {
  const out = [];
  let inBlock = false;
  for (const line of answer.split(/\r?\n/)) {
    if (HEADING.test(line)) inBlock = SOURCE_LINE.test(line);
    if (inBlock || SOURCE_LINE.test(line)) out.push(line);
  }
  return out;
}
const uniq = (a) => [...new Set(a)];

function citation(answer, gaps) {
  const page = uniq(answer.match(PAGE) ?? []);
  const task = uniq(answer.match(TASK_RE) ?? []);
  const docAny = uniq((answer.match(DOC_NAME) ?? []).map((s) => s.trim()));
  const block = sourceBlock(answer);
  const blockText = block.join("\n");
  const docInSource = uniq((blockText.match(DOC_NAME) ?? []).map((s) => s.trim()));
  const tables = uniq(answer.match(DB_TABLE) ?? []);
  const level = page.length ? 3 : docInSource.length ? 2 : block.length ? 1 : 0;
  const manualGap = (gaps ?? []).some((g) => g.component === "manual" && g.reason === "NOT_IN_SOURCE");
  return {
    level,
    level_label: ["출처 표기 없음", "데이터 출처(DB 표·대장)", "문서명 출처", "문서·쪽 인용"][level],
    page_cites: page,
    task_regex_hits: task,
    task_regex_match: task.length > 0,
    doc_names_in_source: docInSource,
    doc_names_anywhere: docAny,
    source_lines: block.length,
    source_snippet: block.filter((l) => SOURCE_LINE.test(l) || DOC_NAME.test(l)).slice(0, 4).map((l) => l.trim().slice(0, 220)),
    db_tables: tables,
    doc_cite_vs_gap: docInSource.some((d) => /매뉴얼/.test(d)) && manualGap ? "답 글은 매뉴얼을 출처로 적었지만 같은 응답 data_gaps 는 manual NOT_IN_SOURCE" : null,
  };
}

function qshape(q) {
  const qk = stripMapTypeParen(q);
  const kinds = Object.entries(KINDS).filter(([, re]) => re.test(qk)).map(([k]) => k);
  const r = q.match(SPATIAL_RADIUS);
  const years = uniq(q.match(YEAR) ?? []);
  const subunits = uniq([...q.matchAll(SUBUNIT)].map((m) => m[1]).filter((s) => !SUBUNIT_STOP.has(s) && !/^(많은|어느|각|같은|지하|소하)/.test(s) && !/(으면|하면|되면|이면|우리|자리|관리|처리)$/.test(s)));
  const breakdowns = uniq([...q.matchAll(BREAKDOWN)].map((m) => m[0]).filter((s) => !s.endsWith("특별")));
  const timeScope = years.length || MONTH_DAY.test(q) ? "연도·시점 명시" : BY_YEAR.test(q) ? "연도별(기간 열림)" : PAST.test(q) ? "과거(기간 없음)" : NOWISH.test(q) ? "지금·가정" : "기간 없음";
  return {
    len: q.length,
    len_nospace: q.replace(/\s/g, "").length,
    kinds,
    n_kinds: kinds.length,
    spatial_radius_m: r ? Number(r[1] ?? r[2]) : null,
    spatial_overlap: SPATIAL_OVERLAP.test(q),
    spatial_area: AREA.test(q),
    spatial: !!r || SPATIAL_OVERLAP.test(q),
    years,
    time_scope: timeScope,
    breakdowns,
    n_breakdowns: breakdowns.length,
    ranking: RANKING.test(q),
    count_ask: COUNT_ASK.test(q),
    summary_ask: SUMMARY_ASK.test(q),
    subunits_named: subunits,
    wide_scope: WIDE_SCOPE.test(q),
    text_warning_condition: TEXT_WARNING.test(q),
    follow_up_phrase: /^(그중|그\s|같은|.*도 같은 기준|영등포구는)/.test(q),
  };
}

// run.mjs 의 판정과 같은 규칙(정답 값이 답 글에 있는가 — 참고용)
const norm = (s) => String(s).replace(/[\s,]/g, "");
function judge(x, answer) {
  if (!answer) return { verdict: "NO_ANSWER", hits: 0, total: 0 };
  const vals = [];
  const walk = (v) => { if (v == null) return; if (typeof v === "object") Object.values(v).forEach(walk); else vals.push(v); };
  if (x?.expected_answer_json && typeof x.expected_answer_json === "object") walk(x.expected_answer_json);
  if (!vals.length) return { verdict: "HUMAN", hits: 0, total: 0 };
  const a = norm(answer);
  const hits = vals.filter((v) => a.includes(norm(typeof v === "number" ? v.toLocaleString("en-US") : v)) || a.includes(norm(v))).length;
  return { verdict: hits === vals.length ? "AUTO_PASS" : hits ? "PARTIAL" : "AUTO_MISS", hits, total: vals.length };
}

// ── 사용자 요구 주제(2026-10-28) — 지역별 세부 주제. q = 질문 글이 그 주제를 묻는가 · a = 답 글에 그 주제가 나오는가 ──
const REGION_TOPICS = {
  busan: {
    label: "부산 — 도심 침수",
    sub: {
      도심하천: { q: /하천/, a: /하천|온천천|수영강|동천|초량천|학장천|대천천|남천|낙동강/ },
      지하차도: { q: /지하차도/, a: /지하차도/ },
      반지하: { q: /반지하|지하층/, a: /반지하|지하층/ },
      "과거 침수 이력": { q: /침수흔적|침수됐던|침수\s?이력|상습침수|과거|(?<!인명)피해/, a: /침수흔적|침수\s?이력|상습침수/ },
      // 질문 쪽은 «위험지구·지정»을 묻는가까지(사유를 직접 묻는 문항은 없다), 답 쪽은 사유 낱말이 나오는가
      "위험지구 지정·사유": { q: /위험지구|개선지구|위험·취약|«가»\s?등급|지정/, a: /지정\s?사유|위험\s?요인|재해\s?원인|피해\s?원인|침수\s?원인/ },
      "통제·대피 기준": { q: /통제|대피|경보|발효/, a: /통제\s?기준|대피\s?기준|통제기준|대피기준/ },
    },
  },
  inje: {
    label: "인제 — 산사태·계곡 재해",
    sub: {
      산사태: { q: /산사태|토석류/, a: /산사태|토석류/ },
      급경사지: { q: /급경사지|붕괴위험/, a: /급경사지|붕괴위험/ },
      "캠핑·야영장": { q: /캠핑|야영장/, a: /캠핑|야영장/ },
      "과거 피해사례": { q: /과거|(?<!인명)피해|사례|침수됐던/, a: /(?<!인명)피해\s?(?:사례|내역|이력|액|규모)|피해가/ },
      // «당시(과거 사건 때)» 조치를 직접 묻는 문항은 없다 — 통제·대피·재난문자를 묻는가로 본다
      "통제·대피(당시 조치)": { q: /통제|대피|재난문자/, a: /재난문자|대피\s?(?:명령|권고|조치|안내)|통제\s?(?:조치|안내)/ },
    },
  },
  yeongcheon: {
    label: "영천 — 소하천 범람·침수",
    sub: {
      소하천: { q: /소하천/, a: /소하천/ },
      재해위험지구: { q: /위험지구|개선지구|위험·취약|재해위험/, a: /위험지구|개선지구/ },
      "과거 피해 이력": { q: /과거|(?<!인명)피해|침수흔적|침수됐던|힌남노/, a: /(?<!인명)피해|침수흔적/ },
      정비계획: { q: /정비사업|정비계획|계획|시행기관/, a: /정비사업|정비계획|중기계획|시행기관|사업\s?기간/ },
      "우선 점검": { q: /우선|먼저|점검/, a: /우선|점검/ },
    },
  },
};
const REGION_OF_CODE = (code) => (code?.startsWith("26") ? "busan" : code === "5181000000" ? "inje" : code === "4723000000" ? "yeongcheon" : null);
function regionTopic(regionId, q, answer) {
  const t = REGION_TOPICS[regionId];
  if (!t) return null;
  const qHits = Object.entries(t.sub).filter(([, v]) => v.q.test(q)).map(([k]) => k);
  const aHits = Object.entries(t.sub).filter(([, v]) => v.a.test(answer)).map(([k]) => k);
  return { region: regionId, label: t.label, q_hits: qHits, q_hit_count: qHits.length, a_hits: aHits, a_only: aHits.filter((k) => !qHits.includes(k)) };
}
// 요구 주제 가운데 지역 질문 51문이 직접 묻지 않는 것 — 다른 문항(역량질문 포함)에서 찾아본다
const GAP_TOPICS = { 반지하: /반지하|지하층/, "캠핑·야영장": /캠핑|야영장/, 소하천: /소하천/, "숙박시설(계곡·산지)": /숙박시설/, "지정 사유": /지정\s?사유/, "통제·대피 기준": /통제\s?기준|대피\s?기준/ };

const REGION_NAMES = ["강원특별자치도 인제군", "경상북도 영천시", "충청남도 서천군", "부산광역시 해운대구", "부산 해운대구", "부산 사하구", "부산 동구", "부산광역시", "부산 지역", "서울 강남구", "강원특별자치도", "충청남도", "인제군", "영천시", "서천군", "정선군", "가평군", "관악구", "영등포구", "강남구", "충주시", "논산시", "부여군", "공주시", "세종시", "부산", "서울", "충주"];
/** 같은 질문 모양 찾기 — 지역 이름·띄어쓰기·끝맺음만 지운 글 */
function shapeKey(q) {
  let s = q;
  for (const n of REGION_NAMES) s = s.replaceAll(n, "{지역}");
  return s.replace(/\(통제\)/g, "").replace(/[\s.?]/g, "").replace(/(을|를)?알려줘$/, "").replace(/\{지역\}(에서|의|에|은|는)?/g, "{지역}");
}

function agent416(x) {
  const m = (x?.agent416_result?.comment ?? "").match(/\((\d+)\s*초(?:\s*·\s*SQL\s*(\d+)회)?\)/);
  return x?.agent416_result ? { grade: x.agent416_result.grade, sec: m ? Number(m[1]) : null, sql: m?.[2] ? Number(m[2]) : null } : null;
}

// ── 문항별 레코드 ──
const records = [];
const ANSWERS = new Map(); // 답 글 전문은 JSON 에 넣지 않는다(녹화 파일에 있다) — 집계에만 쓴다
const readAnswer = (r) => ANSWERS.get(r.id) ?? "";
for (const dir of DIRS) {
  const abs = join(APP, "harness", "recordings", dir);
  const set = dir.startsWith("regional") ? "regional" : "cq";
  for (const f of readdirSync(abs).filter((f) => f.endsWith(".json")).sort()) {
    const j = JSON.parse(readFileSync(join(abs, f), "utf8"));
    const F = j.final ?? {};
    const R = F.result ?? {};
    const req = j.request ?? {};
    const qc = req.query_context ?? {};
    const q = j.question ?? req.question ?? "";
    const answer = R.answer ?? "";
    const el = F.meta?.elapsed_ms ?? null;
    const refsByType = {};
    for (const r of R.refs ?? []) refsByType[r.entity_type] = (refsByType[r.entity_type] ?? 0) + 1;
    const cq = set === "cq" ? CQ[j.id] : null;
    const rg = set === "regional" ? REG[j.id] : null;
    const lib = rg ? LIB[rg.library_id] : null;
    const rt = qc.reference_time ?? null;
    const warn = qc.detail ? `${qc.detail.warning_kind ?? ""}${qc.detail.warning_level ?? ""}` : null;
    const baseTime = F.meta?.base_time ?? null;
    const shape = qshape(q);
    shape.spatial_any = shape.spatial || cq?.variant_kind === "공간" || !!cq?.spatial_op; // 역량질문은 원문 «공간» 변형·spatial_op 도 본다
    const topicRegion = rg?.region_id ?? REGION_OF_CODE(qc.region?.admin_code);
    ANSWERS.set(j.id, answer);
    records.push({
      set,
      id: j.id,
      recording: relative(REPO, join(abs, f)).replaceAll("\\", "/"),
      status: j.timeout ? "TIMEOUT" : F.status ?? null,
      elapsed_ms: el,
      elapsed_s: el == null ? null : Math.round(el / 100) / 10,
      band: el == null ? null : el <= FAST_MS ? "fast" : el >= SLOW_MS ? "slow" : "mid",
      waited_ms: j.waitedMs ?? null,
      completed_at: baseTime, // meta.base_time — 실측상 응답 완료 시각(시작 = 이 값 − elapsed)
      started_at_est: baseTime && el != null ? new Date(Date.parse(baseTime) - el).toISOString() : null,
      question: q,
      question_source: req.question_source ?? null,
      quick_query_id: req.quick_query_id ?? null,
      origin: set === "cq" ? "T3Q 역량질문 변형(cq_variants.json)" : "지역 질문(library.ts → regional_questions.json)",
      condition: {
        query_context: req.query_context ?? null, // 녹화된 요청 그대로
        region: qc.region ?? null,
        disaster_types: qc.disaster_types ?? [],
        reference_time: rt,
        reference_time_kind: !rt ? "없음" : rt.startsWith("2026-08-25T14:00") ? "고정 기준시각(2026-08-25 14:00)" : "사건 시점",
        warning: warn,
        weather_warnings: (req.weather_warnings?.items ?? []).map((w) => `${w.kind}${w.level}${w.change ? " " + w.change : ""}`),
        has_reference_time: !!rt,
        has_warning: !!warn || !!req.weather_warnings,
        has_condition: !!rt || !!warn || !!req.weather_warnings,
      },
      shape,
      topic: regionTopic(topicRegion, q, answer),
      answer_facts: {
        control_depth_cm: uniq([...answer.matchAll(/통제\s?기준[^|\n]{0,12}?(\d+(?:\.\d+)?)\s*cm|(\d+(?:\.\d+)?)\s*cm[^|\n]{0,8}통제/g)].map((m) => Number(m[1] ?? m[2]))).sort((a, b) => a - b),
        evacuation_criteria_mentioned: /주민\s?대피\s?기준|대피\s?기준/.test(answer),
        stage_claim: (answer.match(/현재\s*(?:대응\s*)?단계\**\s*[:：]\s*\**([^\n*]{1,40})/) ?? [])[1]?.trim() ?? null,
      },
      meta: cq
        ? { cq_id: cq.cq_id, variant_kind: cq.variant_kind, template: CQ_TEMPLATE[j.id] ?? null, data_groups: cq.data_groups ?? [], expected_apis: cq.expected_apis ?? [], n_apis_besides_agent: (cq.expected_apis ?? []).filter((a) => a !== "T3Q-01").length, spatial_op: cq.spatial_op ?? null, scope_note: cq.scope_note ?? null, follow_up: !!cq.follow_up, region_scope: cq.region ?? null, agent416: agent416(cq) }
        : rg
          ? { library_id: rg.library_id, region_id: rg.region_id, category: rg.category, stage: rg.stage, template: rg.template, preview: lib?.preview ?? [], n_preview: (lib?.preview ?? []).length }
          : {},
      shape_key: shapeKey(q),
      answer: {
        len: answer.length,
        head: answer.replace(/\s+/g, " ").slice(0, 140),
        n_tables: (answer.match(/^\s*\|\s*:?-{3,}/gm) ?? []).length,
        refs_count: (R.refs ?? []).length,
        refs_by_type: refsByType,
        evidence_refs: (R.evidence_refs ?? []).length,
        entities: (R.entities ?? []).length,
        result_groups: (R.result_groups ?? []).length,
        data_gaps: F.data_gaps ?? [],
        data_gaps_count: (F.data_gaps ?? []).length,
        warnings_count: (F.warnings ?? []).length,
        limitations: R.limitations ?? [],
        context_used: R.context_used ?? null,
      },
      citation: citation(answer, F.data_gaps),
      judge: cq ? judge(cq, answer) : null,
    });
  }
}

// ── 집계 ──
const secs = (rs) => rs.map((r) => r.elapsed_ms / 1000).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
const q = (a, p) => { if (!a.length) return null; const i = (a.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return Math.round((a[lo] + (a[hi] - a[lo]) * (i - lo)) * 10) / 10; };
function stat(rs) {
  const a = secs(rs);
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return { n: a.length, median_s: q(a, 0.5), mean_s: a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null, p25_s: q(a, 0.25), p75_s: q(a, 0.75), min_s: r1(a[0]), max_s: r1(a.at(-1)), fast: rs.filter((r) => r.band === "fast").length, slow: rs.filter((r) => r.band === "slow").length };
}
const groupBy = (rs, f) => { const m = {}; for (const r of rs) { for (const k of [].concat(f(r))) (m[k] ??= []).push(r); } return m; };
const statBy = (rs, f) => Object.fromEntries(Object.entries(groupBy(rs, f)).map(([k, v]) => [k, { ...stat(v), ids: v.map((r) => r.id) }]));
function rank(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; }
function spearman(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 5) return null;
  const rx = rank(pairs.map((p) => p[0])), ry = rank(pairs.map((p) => p[1]));
  const n = pairs.length, mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return { rho: Math.round((num / Math.sqrt(dx * dy)) * 100) / 100, n };
}

const all = records;
const cqR = all.filter((r) => r.set === "cq");
const rgR = all.filter((r) => r.set === "regional");
const el = (r) => r.elapsed_ms / 1000;

const shapeGroups = Object.values(groupBy(all, (r) => r.shape_key)).filter((v) => v.length > 1)
  .map((v) => ({ shape: v[0].question, ids: v.map((r) => r.id), elapsed_s: v.map((r) => r.elapsed_s), min_s: Math.min(...v.map(el)), max_s: Math.max(...v.map(el)), spread_s: Math.round((Math.max(...v.map(el)) - Math.min(...v.map(el))) * 10) / 10 }))
  .sort((a, b) => a.min_s - b.min_s);
const famOf = (r) => r.meta?.template ?? (r.set === "regional" ? `(없음:${r.meta.library_id})` : "(템플릿 밖)");
const templateFamilies = Object.entries(groupBy(all, famOf)).map(([t, v]) => ({ template: t, ...stat(v), items: v.map((r) => ({ id: r.id, s: r.elapsed_s })) })).sort((a, b) => a.median_s - b.median_s);

const summary = {
  sets: { all: stat(all), cq: stat(cqR), regional: stat(rgR) },
  status: Object.fromEntries(Object.entries(groupBy(all, (r) => r.status)).map(([k, v]) => [k, v.length])),
  elapsed_grid_hits: all.filter((r) => { const m = r.elapsed_ms % 10000; return m >= 5000 && m < 7000; }).length,
  elapsed_grid_off: all.filter((r) => { const m = r.elapsed_ms % 10000; return !(m >= 5000 && m < 7000); }).map((r) => `${r.id} ${r.elapsed_s}`),
  elapsed_quantization_note: "elapsed_ms 는 대부분 «10초 × n + 5~7초» 격자 값(55.2·65.3·75.3 …)으로 나온다 — 격자 밖은 elapsed_grid_off. T3Q 쪽 완료 확인 주기로 보인다(추정)",
  waited_minus_elapsed_s: stat(all.map((r) => ({ elapsed_ms: r.waited_ms - r.elapsed_ms }))),
  by_band: Object.fromEntries(["fast", "mid", "slow"].map((b) => [b, all.filter((r) => r.band === b).map((r) => r.id)])),
  by_question_source: statBy(all, (r) => r.question_source),
  by_variant_kind: statBy(cqR, (r) => r.meta.variant_kind),
  by_region_id: statBy(rgR, (r) => r.meta.region_id),
  by_region_level: statBy(all, (r) => r.condition.region?.level ?? "없음"),
  by_reference_time_kind: statBy(all, (r) => r.condition.reference_time_kind),
  by_warning_condition: statBy(all, (r) => (r.condition.has_warning ? "특보 조건 있음" : "특보 조건 없음")),
  by_text_warning: statBy(all, (r) => (r.shape.text_warning_condition ? "질문 글에 특보 가정" : "질문 글에 특보 가정 없음")),
  by_n_kinds: statBy(all, (r) => String(Math.min(r.shape.n_kinds, 4)) + (r.shape.n_kinds >= 4 ? "+" : "")),
  by_spatial: statBy(all, (r) => (r.shape.spatial_radius_m ? "반경 지정" : r.shape.spatial_overlap ? "포함·중첩(반경 없음)" : r.shape.spatial_any ? "공간 변형(글에 표현 없음)" : "공간 조건 없음")),
  region_topics: Object.fromEntries(Object.keys(REGION_TOPICS).map((rid) => [rid, rgR.filter((r) => r.topic?.region === rid)
    .map((r) => ({ id: r.id, question: r.question, elapsed_s: r.elapsed_s, q_hits: r.topic.q_hits, a_only: r.topic.a_only, cite_level: r.citation.level, refs: r.answer.refs_count, control_depth_cm: r.answer_facts.control_depth_cm }))
    .sort((a, b) => b.q_hits.length - a.q_hits.length || a.elapsed_s - b.elapsed_s)])),
  region_topics_cq_same_region: all.filter((r) => r.set === "cq" && r.topic).map((r) => ({ id: r.id, region: r.topic.region, question: r.question, elapsed_s: r.elapsed_s, q_hits: r.topic.q_hits, cite_level: r.citation.level, refs: r.answer.refs_count })),
  gap_topics: Object.fromEntries(Object.entries(GAP_TOPICS).map(([k, re]) => [k, {
    asked_by: all.filter((r) => re.test(r.question)).map((r) => ({ id: r.id, elapsed_s: r.elapsed_s, cite_level: r.citation.level, refs: r.answer.refs_count, region: r.condition.region?.name })),
    answered_in_regional: rgR.filter((r) => re.test(r.question) === false && re.test(readAnswer(r))).map((r) => r.id),
  }])),
  stage_claims_without_condition: all.filter((r) => r.answer_facts.stage_claim).map((r) => ({ id: r.id, has_warning_condition: r.condition.has_warning, stage_claim: r.answer_facts.stage_claim, data_gaps: r.answer.data_gaps })),
  control_depth_mentions: all.filter((r) => r.answer_facts.control_depth_cm.length).map((r) => ({ id: r.id, cm: r.answer_facts.control_depth_cm })),
  by_time_scope: statBy(all, (r) => r.shape.time_scope),
  by_cite_level: statBy(all, (r) => r.citation.level_label),
  by_kind: statBy(all, (r) => (r.shape.kinds.length ? r.shape.kinds : ["(없음)"])),
  same_shape_groups: shapeGroups,
  template_families: templateFamilies,
  correlations_with_elapsed: {
    question_len: spearman(all.map((r) => r.shape.len), all.map(el)),
    n_kinds: spearman(all.map((r) => r.shape.n_kinds), all.map(el)),
    n_breakdowns: spearman(all.map((r) => r.shape.n_breakdowns), all.map(el)),
    answer_len: spearman(all.map((r) => r.answer.len), all.map(el)),
    refs_count: spearman(all.map((r) => r.answer.refs_count), all.map(el)),
    cq_n_apis_besides_agent: spearman(cqR.map((r) => r.meta.n_apis_besides_agent), cqR.map(el)),
    cq_agent416_sec: spearman(cqR.map((r) => r.meta.agent416?.sec), cqR.map(el)),
    cq_agent416_sql: spearman(cqR.map((r) => r.meta.agent416?.sql), cqR.map(el)),
  },
  citation_totals: {
    page_cites: all.filter((r) => r.citation.page_cites.length).length,
    doc_name_in_source: all.filter((r) => r.citation.doc_names_in_source.length).map((r) => ({ id: r.id, docs: r.citation.doc_names_in_source })),
    task_regex_match: all.filter((r) => r.citation.task_regex_match).length,
    source_block: all.filter((r) => r.citation.source_lines > 0).length,
    evidence_refs_nonempty: all.filter((r) => r.answer.evidence_refs > 0).length,
    data_gaps_nonempty: all.filter((r) => r.answer.data_gaps_count > 0).map((r) => r.id),
    warnings_nonempty: all.filter((r) => r.answer.warnings_count > 0).map((r) => r.id),
    refs_entity_types: Object.fromEntries(Object.entries(all.reduce((m, r) => { for (const [k, v] of Object.entries(r.answer.refs_by_type)) m[k] = (m[k] ?? 0) + v; return m; }, {})).sort((a, b) => b[1] - a[1])),
  },
};

const legend = {
  elapsed_ms: "final.meta.elapsed_ms — T3Q 쪽 처리 시간. band: fast ≤ 90초 · slow ≥ 180초 · 그 사이 mid",
  waited_ms: "하네스가 질문을 보내고 결과를 받기까지(3초 간격 결과 조회 포함)",
  completed_at: "final.meta.base_time — 녹화상 응답 완료 시각과 일치(시작 추정 = base_time − elapsed)",
  condition: "녹화된 요청 body 의 query_context(+ weather_warnings). has_condition = 기준시각 또는 특보 조건이 있음",
  shape: "질문 글에서 뽑은 모양 — kinds = 질문에 나온 대상 데이터 종류(우리 정규식 분류, KINDS), spatial = 반경(m 안·반경) 또는 포함·중첩 표현, time_scope = 연도·시점 명시 / 연도별(기간 열림) / 과거(기간 없음) / 지금·가정 / 기간 없음",
  citation: "답 글의 근거 표기 — 3 문서·쪽 인용(쪽|페이지|p.n) · 2 출처 줄·출처 절에 문서명(재해연보·재난연감·보고서·조서·계획·매뉴얼) · 1 출처 줄은 있으나 DB 표·대장 이름뿐 · 0 없음. task_regex = 과업 지시 예시 정규식(쪽|페이지|p.\\s?\\d|재해연보|재난연감|보고서|계획) 그대로",
  judge: "역량질문만 — run.mjs 와 같은 규칙(정답 JSON 의 값이 답 글에 있는가). 참고용",
  meta_agent416: "cq_variants.json 의 T3Q 416 채점 메모(2026-10-22, T3Q 쪽 실행)의 «(초 · SQL 회)»",
  regexes: { KINDS: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.source])), SPATIAL_RADIUS: SPATIAL_RADIUS.source, SPATIAL_OVERLAP: SPATIAL_OVERLAP.source, PAGE: PAGE.source, DOC_NAME: DOC_NAME.source, SOURCE_LINE: SOURCE_LINE.source, TEXT_WARNING: TEXT_WARNING.source },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), script: "app/harness/demo/analyze_recordings.mjs", recordings: DIRS.map((d) => `app/harness/recordings/${d}`), thresholds: { fast_ms: FAST_MS, slow_ms: SLOW_MS }, legend, summary, records }, null, 2), "utf8");

// ── 콘솔 요약 ──
const s = summary.sets;
console.log(`문항 ${all.length} (역량 ${cqR.length} · 지역 ${rgR.length}) · 상태 ${JSON.stringify(summary.status)}`);
for (const k of ["all", "cq", "regional"]) console.log(`  ${k.padEnd(8)} 중앙값 ${s[k].median_s}초 · 평균 ${s[k].mean_s} · 최소 ${s[k].min_s} · 최대 ${s[k].max_s} · 빠름(≤90) ${s[k].fast} · 느림(≥180) ${s[k].slow}`);
console.log(`근거: 쪽 인용 ${summary.citation_totals.page_cites} · 출처 절/줄 ${summary.citation_totals.source_block} · 출처에 문서명 ${summary.citation_totals.doc_name_in_source.length} · 예시 정규식 일치 ${summary.citation_totals.task_regex_match} · evidence_refs 채움 ${summary.citation_totals.evidence_refs_nonempty}`);
console.log("→", OUT);
