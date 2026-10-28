// 규칙 분류기 평가 — 역량질문 변형 70문의 T3Q 기대 API(expected_apis)를 정답으로 정밀도·재현율·기권율을 잰다.
// node harness/classify/eval.mjs → harness/reports/classify_<ts>.md
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP } from "../t3q/client.mjs";
import { classify } from "./rules.mjs";

const items = JSON.parse(readFileSync(join(APP, "harness", "cq", "cq_variants.json"), "utf8"));
let predicted = 0, correct = 0, abstain = 0, coverable = 0;
const rows = [];
for (const x of items) {
  const truth = new Set((x.expected_apis ?? []).filter((a) => ["T3Q-04", "T3Q-05", "T3Q-30"].includes(a)));
  if (truth.size) coverable++;
  const p = classify(x.question);
  if (!p.length) { abstain++; rows.push({ id: x.id, pred: "-", truth: [...truth].join(",") || "-", ok: "기권" }); continue; }
  predicted++;
  const ok = p.every((h) => truth.has(h.api));
  if (ok) correct++;
  rows.push({ id: x.id, pred: p.map((h) => `${h.api}/${h.group}`).join(","), truth: [...truth].join(",") || "-", ok: ok ? "맞음" : "틀림", q: x.question });
}
const prec = predicted ? correct / predicted : 0;
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const md = [
  `# 자유 질문 규칙 분류 평가 — ${ts}`,
  "",
  `정답 기준: 역량질문 변형 70문의 T3Q 기대 API(expected_apis) 중 자동 조회 대상(T3Q-04·05·30).`,
  "",
  `| 지표 | 값 |`, `|---|---|`,
  `| 분류(선표출) 한 질문 | ${predicted} / ${items.length} |`,
  `| **정밀도**(선표출한 것 중 맞은 비율) | **${(prec * 100).toFixed(1)}%** (${correct}/${predicted}) |`,
  `| 재현율(대상 API 가 있는 질문 중 선표출) | ${coverable ? ((correct / coverable) * 100).toFixed(1) : 0}% (${correct}/${coverable}) |`,
  `| 기권 | ${abstain} |`,
  "",
  `판정: 정밀도 95% 이상이면 2차 적용 후보(사용자 승인 필요). 틀린 것은 아래 표.`,
  "",
  "| ID | 예측 | 정답(자동 조회 대상) | 결과 |",
  "|---|---|---|---|",
  ...rows.filter((r) => r.ok !== "기권").map((r) => `| ${r.id} | ${r.pred} | ${r.truth} | ${r.ok} |`),
].join("\n");
mkdirSync(join(APP, "harness", "reports"), { recursive: true });
const f = join(APP, "harness", "reports", `classify_${ts}.md`);
writeFileSync(f, md);
console.log(`정밀도 ${(prec * 100).toFixed(1)}% (${correct}/${predicted}) · 재현율 ${correct}/${coverable} · 기권 ${abstain}`);
for (const r of rows.filter((r) => r.ok === "틀림")) console.log("틀림", r.id, r.pred, "정답", r.truth, "|", r.q);
console.log(f);
