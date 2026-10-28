// 하네스 ① 계약 테스트 — T3Q 실응답 녹화본(harness/recordings)을 zod 스키마로 검증한다.
// npx vitest run harness/contract
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as S from "@/lib/t3q/schemas";

const REC = join(__dirname, "..", "recordings");
const files = readdirSync(REC).filter((f) => f.endsWith(".json"));
const load = (prefix: string) => files.filter((f) => f.startsWith(prefix)).map((f) => JSON.parse(readFileSync(join(REC, f), "utf8")));

// API ID → 결과 스키마(SUCCESS/PARTIAL_SUCCESS 일 때)
const RESULT: Record<string, import("zod").ZodType> = {
  "T3Q-04": S.SimilarSearchResult, "T3Q-10": S.EventDetailResult, "T3Q-11": S.SimilarityResult, "T3Q-12": S.TimelineResult,
  "T3Q-05": S.RiskSearchResult, "T3Q-15": S.RiskObjectResult, "T3Q-15-HZ": S.RiskObjectResult, "T3Q-15-SL": S.RiskObjectResult,
  "T3Q-30": S.FloodTraceResult, "T3Q-19": S.EvidenceResult, "T3Q-18": S.KgResult, "EXT-01": S.GeometryResult,
  "EXT-01-from-agent-fixture": S.GeometryResult,
};

describe("Data API 녹화본", () => {
  const runs = load("data_").flat() as { id: string; http: number; response: unknown }[];
  it("녹화본이 있다", () => expect(runs.length).toBeGreaterThan(0));
  for (const r of runs) {
    const body = r.response as { status?: string } | string;
    if (typeof body !== "object" || !body || !("schema_version" in body)) continue; // 401/422/404(FastAPI 기본꼴)는 봉투가 아님
    it(`${r.id} 봉투`, () => {
      const ok = body.status === "SUCCESS" || body.status === "PARTIAL_SUCCESS";
      const schema = S.envelope(ok && RESULT[r.id] ? RESULT[r.id] : z.unknown());
      const res = schema.safeParse(body);
      expect(res.success, JSON.stringify(res.error?.issues?.slice(0, 3))).toBe(true);
      if (body.status === "DATA_NOT_AVAILABLE") expect((body as { data_gaps?: unknown[] }).data_gaps?.length).toBeGreaterThan(0);
    });
  }
});

describe("Agent ASYNC 녹화본", () => {
  const probes = load("probe_") as { runs: { final: unknown }[] }[];
  for (const p of probes) for (const [i, r] of p.runs.entries()) {
    it(`run#${i} 최종 응답 = AgentQueryEnvelope`, () => {
      const res = S.AgentQueryEnvelope.safeParse(r.final);
      expect(res.success, JSON.stringify(res.error?.issues?.slice(0, 3))).toBe(true);
    });
    it(`run#${i} #ref 표지는 모두 refs[] 에 있다`, () => {
      const f = r.final as { result: { answer: string; refs: { ref: string }[] } };
      const marks = new Set([...f.result.answer.matchAll(/#ref:(r\d+)/g)].map((m) => m[1]));
      const refs = new Set(f.result.refs.map((x) => x.ref));
      for (const m of marks) expect(refs.has(m), m).toBe(true);
    });
  }
});
