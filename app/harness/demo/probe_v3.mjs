// 하네스 — 시연 대본 v3 새 장면 실측(사용자 결정 2026-10-29): 실제 T3Q 에이전트(ASYNC)에 보내 원응답을 녹화한다.
//  (가) AI 모드 점검 3건 — AIM_Q(AiModeModal.tsx R36 원문) · 시연 시나리오 특보(부산 호우경보 · 인제 호우주의보 · 영천 호우경보)
//  (나) 부산 브리핑 4항목 — AI 모드를 켠 채 [브리핑 시작] 과 같은 요청(BR-01·02·03 원문 + 4번 「하천 옆 지하차도」 = BS-01 질문 글)
//  (다) 마무리 대체 후보 — 영천 YC-09(정비계획 없이 우선 점검 구역) · 부산 BS-07 기준지역 동구 다시 재기
//  (라) 질문 글 고침 — 부산 BS-02 「·CCTV」 뺀 글(사용자 지시 2026-10-30 · BS-02-v4)
// node harness/demo/probe_v3.mjs [--only AIM-BS,BRF-BS-4]   → harness/recordings/demo_v3/<id>.json (request·raw·elapsedMs·waitedMs)
// 요청 모양 = 앱 jobs.ts submitJob 이 T3Q 로 보내는 본문(caller·conversation_id·turn_no·question·question_source·query_context·reference
//   ·briefing·ai_mode·weather_warnings, response_mode 는 askAsync 가 붙임). caller.user_id 는 하네스용 가명.
// 토큰은 client.mjs 가 app/.env.local 에서 읽는다(출력하지 않음). 동시 3건까지.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP, askAsync } from "../t3q/client.mjs";
import { libById } from "../../src/lib/library.ts";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg("only", "").split(",").map((s) => s.trim()).filter(Boolean);
const CONCURRENCY = 3;

// AiModeModal.tsx AIM_Q 원문(R36) — 글자 그대로
const AIM_Q =
  "제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 먼저 확인할 내용을 알려 주십시오. 발효 중인 특보가 있으면 특보마다 2문장 이내(공백 포함 80자 내외)로만 쓰고, 제목·과거 사례·근거 목록은 쓰지 마십시오. 발효 중인 특보가 없으면 대응 검토가 필요한 사유를 확인하지 못했다는 점검 결과만 1문장으로 쓰십시오. 제공되지 않은 관측값이나 피해 발생 여부는 추정하지 마십시오.";

const REGION = {
  BS: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" },
  IJ: { admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" },
  YC: { admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" },
};
const BUSAN_DONGGU = { admin_code: "2617000000", level: "SIGUNGU", name: "부산광역시 동구" };

// 시연 시나리오 특보(사용자 결정 2026-10-29) — wxref.ts warningsPayload 와 같은 칸. 시각은 보내는 시각
const SCENARIO = {
  BS: { kind: "호우", level: "경보", area: "부산" },
  IJ: { kind: "호우", level: "주의보", area: "강원도(인제평지, 인제산지)" },
  YC: { kind: "호우", level: "경보", area: "경상북도(영천)" },
};
const scenarioWarnings = (r) => {
  const now = new Date().toISOString();
  const s = SCENARIO[r];
  return {
    collect_status: "COLLECTED",
    collected_at: now,
    source: "시연 시나리오(가상 특보)",
    items: [{ warning_key: `SCN-${r}-1`, kind: s.kind, level: s.level, area: s.area, announced_at: now, effective_at: now, change: "발효" }],
  };
};
const caller = (region) => ({ user_id: "U-harness-v3", role: "LOCAL_GOV_OFFICER", org_admin_code: region.admin_code });

// BS-01 질문 글(H_chain_busan.json BS-01 question 그대로)
const BS01_Q = "부산 지하차도 가운데 하천 500m 안에 있는 곳을 재해위험등급·인접 하천·통제 기준 수심과 함께 보여줘.";

const CASES = [];
// (가) AI 모드 점검 — 서버는 AI_MODE 에 기준지역만 싣는다(route.ts R39), turn_no 1(turnNo 없음)
for (const r of ["BS", "IJ", "YC"]) {
  CASES.push({
    id: `AIM-${r}`, group: "가", what: `AI 모드 점검 · ${SCENARIO[r].kind}${SCENARIO[r].level}(${SCENARIO[r].area}) 시나리오`,
    question: AIM_Q,
    build: () => ({
      caller: caller(REGION[r]), conversation_id: null, turn_no: 1, question_source: "AI_MODE",
      query_context: { region: REGION[r] }, reference: null,
      ai_mode: { check_id: `CHK-V3-${r}-${Date.now()}`, trigger: "START", interval_min: 10 },
      weather_warnings: scenarioWarnings(r),
    }),
  });
}
// (나) 부산 브리핑 4항목 — explore/page.tsx startBriefing: 기본 문항은 libraryId → 재난유형 = 문항 disasterTypes, 4번(새 항목)은 세션 값(전체 → 없음)
const items = [
  ...["BR-01", "BR-02", "BR-03"].map((id) => ({ key: id, q: libById(id).text, types: libById(id).disasterTypes ?? [] })),
  { key: "c-BS-01", q: BS01_Q, types: [] },
];
items.forEach((it, i) => {
  CASES.push({
    id: `BRF-BS-${i + 1}`, group: "나", what: `부산 브리핑 ${i + 1}/4 · ${it.key}`,
    question: it.q,
    build: () => {
      const qc = { region: REGION.BS };
      if (it.types.length) qc.disaster_types = it.types;
      return {
        caller: caller(REGION.BS), conversation_id: null, turn_no: i + 1, question_source: "BRIEFING",
        query_context: qc, reference: null,
        briefing: { preset_id: "MY-BRIEFING", briefing_item_id: it.key, item_no: i + 1, item_total: items.length },
        weather_warnings: scenarioWarnings("BS"),
      };
    },
  });
});
// (다) 마무리 대체 후보
CASES.push({
  id: "YC-09", group: "다", what: "영천 마무리 — 소하천 주변 위험지구 + 힌남노 피해로 우선 점검 구역(정비계획 없음)",
  question: "영천시 북안면 명주리 북안명주 지구, 당리 대평지, 용계리 소하천 제방 유실 구간(769-3 등)을 위험등급·위험지구 지정 여부·2022년 태풍 힌남노 피해액으로 비교해, 우선 점검할 구역 순서로 한 표로 정리해줘.",
  build: () => ({
    caller: caller(REGION.YC), conversation_id: null, turn_no: 1, question_source: "USER",
    query_context: { region: REGION.YC, disaster_types: ["호우"] }, reference: null,
  }),
});
CASES.push({
  id: "BS-07-v3", group: "다", what: "부산 마무리 후보 — BS-07 기준지역 동구 다시 재기",
  question: "부산 동구 초량동에서 지하층이 있는 주택 가운데 침수흔적 범위 안에 있는 집은 몇 동이고, 어느 침수흔적 지구에 속해?",
  build: () => ({
    caller: caller(BUSAN_DONGGU), conversation_id: null, turn_no: 1, question_source: "USER",
    query_context: { region: BUSAN_DONGGU, disaster_types: ["호우"] }, reference: null,
  }),
});

// (라) 질문 글 고침 — BS-02 에서 「·CCTV」 뺌(사용자 지시 2026-10-30). 화면 묶음 항목(DD-BS-02)과 같은 글·조건(프리셋 = 가정 조건 MANUAL), 출처 질문 모음(SUGGEST)
CASES.push({
  id: "BS-02-v4", group: "라", what: "부산 단계 5 — 호우경보 때 지하차도 차단시설·설비(CCTV 뺀 글)",
  question: libById("DD-BS-02").text,
  build: () => ({
    caller: caller(REGION.BS), conversation_id: null, turn_no: 1, question_source: "SUGGEST",
    query_context: {
      region: REGION.BS, disaster_types: ["호우"],
      detail: { warning_kind: "호우", warning_level: "경보", conditions: [{ item: "RAIN_1H", label: "1시간 강우", value: 50, unit: "mm", source_type: "MANUAL" }] },
    },
    reference: null,
  }),
});

const todo = ONLY.length ? CASES.filter((c) => ONLY.includes(c.id)) : CASES;
const dir = join(APP, "harness", "recordings", "demo_v3");
mkdirSync(dir, { recursive: true });

async function runOne(c) {
  const body = c.build();
  const t0 = Date.now();
  console.log(`>> 보냄 ${c.id} ${new Date(t0).toISOString()}`);
  const r = await askAsync(c.question, body);
  const f = r.final ?? {};
  const res = f.result ?? {};
  const answer = res.answer ?? "";
  const rec = {
    id: c.id, group: c.group, what: c.what, question: c.question, request: { question: c.question, response_mode: "ASYNC", ...body },
    status: f.status ?? (r.timeout ? "TIMEOUT" : null), http: r.http ?? r.submit?.http ?? null,
    elapsedMs: f.meta?.elapsed_ms ?? null, waitedMs: r.waitedMs, at: new Date(t0).toISOString(), raw: f,
  };
  writeFileSync(join(dir, `${c.id}.json`), JSON.stringify(rec, null, 1));
  const refs = res.refs ?? [];
  console.log(`== ${c.id} · ${rec.status} · 처리 ${Math.round((rec.elapsedMs ?? 0) / 1000)}초 · 기다림 ${Math.round(r.waitedMs / 1000)}초 · 답 ${answer.length}자 · refs ${refs.length} · data_gaps ${JSON.stringify(res.data_gaps ?? f.data_gaps ?? []).slice(0, 300)}`);
  console.log(answer.slice(0, 600));
  return rec;
}

// 동시 3건까지
const queue = [...todo];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const c = queue.shift();
      try { await runOne(c); } catch (e) { console.log(`!! ${c.id} 실패: ${e.message}`); }
    }
  }),
);
console.log(`녹화: ${dir}`);
