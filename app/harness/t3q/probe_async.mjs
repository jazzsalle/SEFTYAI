// 실측: ASYNC 에이전트 질의 N개를 동시에 보내 응답 시간·동시 처리·응답 구조를 기록한다.
// node harness/t3q/probe_async.mjs  → harness/recordings/probe_<시각>.json
import { askAsync, save, t3q } from "./client.mjs";

const QUESTIONS = [
  { question: "부산광역시의 자연재해위험개선지구 중 가 등급 지구는 어디인가요?",
    query_context: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" }, disaster_types: ["호우"] } },
  { question: "인제군의 급경사지 가운데 위험등급이 높은 곳은 어디인가요?",
    query_context: { region: { admin_code: "5181000000", level: "SIGUNGU", name: "인제군" }, disaster_types: ["호우"] } },
  { question: "영천시에서 과거 호우로 피해가 컸던 사례는?",
    query_context: { region: { admin_code: "4723000000", level: "SIGUNGU", name: "영천시" }, disaster_types: ["호우"] } },
];

const sq = await t3q("GET", "/suggested-questions?per_group=3");
console.log("suggested-questions", sq.http, sq.ms + "ms", (sq.json?.result?.items || []).length + "건");

const t0 = Date.now();
const runs = await Promise.all(QUESTIONS.map(async (q, i) => {
  const r = await askAsync(q.question, { question_source: "USER", query_context: q.query_context });
  const res = r.final?.result || {};
  console.log(`#${i} ${r.timeout ? "TIMEOUT" : r.final?.status} ${Math.round(r.waitedMs / 1000)}s polls=${r.polls} answer=${(res.answer || "").length}자 refs=${(res.refs || []).length}`);
  return { ...q, ...r };
}));
console.log("전체", Math.round((Date.now() - t0) / 1000) + "s");
console.log(save(`recordings/probe_${new Date().toISOString().replace(/[:.]/g, "-")}.json`, { suggested: sq.json, runs }));
