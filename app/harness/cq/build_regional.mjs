// 지역 질문 세트 생성 — src/lib/library.ts(부산·인제·영천 질문 라이브러리)를 하네스 실행용 regional_questions.json 으로 펼친다.
// node harness/cq/build_regional.mjs → harness/cq/regional_questions.json  (실행: node harness/cq/run.mjs --set regional)
// 정답(expected_answer)은 비어 있다 — T3Q 가 확인 SQL 로 계산해 줘야 한다(06_t3q_requests.md #10).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP } from "../t3q/client.mjs";
import { LIBRARY, fillText } from "../../src/lib/library.ts";
import { PILOT_T3Q } from "../../src/lib/t3q/region.ts";

const out = [];
for (const [rid, region] of Object.entries(PILOT_T3Q)) {
  for (const q of LIBRARY) {
    if (q.regions && !q.regions.includes(rid)) continue;
    if (q.after) continue; // 연속 질의 2턴은 앞 답이 있어야 하므로 배치에서 뺀다
    out.push({
      id: `${rid}:${q.id}`,
      library_id: q.id,
      region_id: rid,
      category: q.category,
      stage: q.stage,
      template: q.template ?? null,
      question: fillText(q, region.name),
      question_source: q.id.startsWith("BR-") ? "BRIEFING" : "SUGGEST",
      quick_query_id: q.quickQueryId ?? null,
      query_context_draft: { region, disaster_types: q.disasterTypes ?? [] },
      expected_answer: null,
      expected_answer_json: null,
    });
  }
}
writeFileSync(join(APP, "harness", "cq", "regional_questions.json"), JSON.stringify(out, null, 2));
console.log(out.length, "문항", Object.fromEntries(Object.keys(PILOT_T3Q).map((r) => [r, out.filter((x) => x.region_id === r).length])));
