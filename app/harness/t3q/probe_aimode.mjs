// 하네스 — AI 모드 점검 질의 비교: 요구사항 원문(UFR-001-001-05, 특보마다 2문장·80자 내외) 질문의 답 길이·처리 시간
// node harness/t3q/probe_aimode.mjs   → harness/recordings/aimode_<ts>.json (원응답 그대로)
// 실제 T3Q 에 2건을 보낸다: 특보 없음(부산 — 기상청 현황 그대로 빈 목록) · 특보 있음(역량질문 시험 조건과 같은 시험용 호우경보 1건 — 화면에는 쓰지 않음)
import { askAsync, save } from "./client.mjs";

export const AIM_Q_REQ =
  "제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 상황확인 또는 재난대응 착수를 우선 검토해야 합니까? 활용 가능한 재난안전 데이터를 참고하여, 발효 중인 특보가 있으면 특보마다 담당자가 먼저 확인할 내용을 과거 사례나 위험지역 근거와 함께 2문장 이내(공백 포함 80자 내외)로 작성하고, 참고한 근거를 함께 반환하십시오. 발효 중인 특보가 없으면, 과거 사례나 위험지역은 언급하지 말고 제공된 정보에서 대응 검토가 필요한 사유를 확인하지 못했다는 점검 결과만 2문장 이내로 반환하십시오. 제공되지 않은 관측값이나 피해 발생 여부는 추정하지 마십시오.";

const BUSAN = { admin_code: "2600000000", level: "SIDO", name: "부산광역시" };
const now = new Date().toISOString();
const cases = [
  { id: "none", warnings: { collect_status: "COLLECTED", collected_at: now, source: "기상청 기상특보 조회서비스", items: [] } },
  {
    id: "rain-warning",
    warnings: {
      collect_status: "COLLECTED",
      collected_at: now,
      source: "시험 조건(역량질문 시험과 같은 방식)",
      items: [{ warning_key: "TEST-AIM-1", kind: "호우", level: "경보", area: "부산", announced_at: now, effective_at: now, change: "발효" }],
    },
  },
];

const out = [];
await Promise.all(
  cases.map(async (c) => {
    const r = await askAsync(AIM_Q_REQ, {
      question_source: "AI_MODE",
      query_context: { region: BUSAN },
      ai_mode: { check_id: `CHK-PROBE-${c.id}`, trigger: "MANUAL", interval_min: 10 },
      weather_warnings: c.warnings,
    });
    const ans = r.final?.result?.answer ?? "";
    const row = { id: c.id, status: r.final?.status, elapsedMs: r.final?.meta?.elapsed_ms ?? null, waitedMs: r.waitedMs, answerChars: ans.length, answer: ans, refs: (r.final?.result?.refs ?? []).length, raw: r.final };
    out.push(row);
    console.log(`\n== ${c.id} · ${row.status} · 처리 ${Math.round((row.elapsedMs ?? 0) / 1000)}초 · 답 ${row.answerChars}자 · refs ${row.refs}\n${ans}`);
  }),
);
const f = save(`recordings/aimode_${now.replace(/[:.]/g, "-")}.json`, out);
console.log("\nsaved", f);
