// 하네스 — AI 모드 점검 질의(R36 — 요구사항 UFR-001-001-05 를 사용자 지시로 줄인 글, AiModeModal.tsx 의 AIM_Q 와 같게)의 답 길이·처리 시간
// node harness/t3q/probe_aimode.mjs   → harness/recordings/aimode_<ts>.json (원응답 그대로)
// 실제 T3Q 에 2건을 보낸다: 특보 없음(부산 — 기상청 현황 그대로 빈 목록) · 특보 있음(역량질문 시험 조건과 같은 시험용 호우경보 1건 — 화면에는 쓰지 않음)
import { askAsync, save } from "./client.mjs";

export const AIM_Q_REQ =
  "제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 먼저 확인할 내용을 알려 주십시오. 발효 중인 특보가 있으면 특보마다 2문장 이내(공백 포함 80자 내외)로만 쓰고, 제목·과거 사례·근거 목록은 쓰지 마십시오. 발효 중인 특보가 없으면 대응 검토가 필요한 사유를 확인하지 못했다는 점검 결과만 1문장으로 쓰십시오. 제공되지 않은 관측값이나 피해 발생 여부는 추정하지 마십시오.";

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
