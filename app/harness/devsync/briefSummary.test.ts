// 브리핑 머리말(개발서버 BriefingPanel summarize · topicParticle · formatStamp). npx vitest run harness/devsync
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ useSession: () => ({}) }));
import { briefStamp, briefSummary, topicParticle } from "@/components/explore/BriefBoard";

const c = (kind: "run" | "wait" | "done" | "err" | "off", label: string | null = null, no = 1) => ({ kind, label, no });

describe("브리핑 머리말", () => {
  it("진행 중이면 「결과를 확인하고 있습니다.」", () => {
    expect(briefSummary([c("done"), c("run")])).toBe("결과를 확인하고 있습니다.");
  });
  it("다 되면 센 것만, 실패가 있으면 이름과 조사", () => {
    expect(briefSummary([c("done"), c("done")])).toBe("브리핑 항목 2개를 정리했습니다.");
    expect(briefSummary([c("done"), c("err", "기상특보"), c("err", "침수 이력")])).toBe("브리핑 항목 1개를 정리했습니다. 기상특보, 침수 이력은 불러오지 못했습니다.");
    expect(briefSummary([c("done"), c("err", null, 3)])).toBe("브리핑 항목 1개를 정리했습니다. 3번 항목은 불러오지 못했습니다.");
  });
  it("취소는 실패로 세지 않고, 모두 실패면 null(머리에 「브리핑 결과를 불러오지 못했습니다.」)", () => {
    expect(briefSummary([c("done"), c("off", "x")])).toBe("브리핑 항목 1개를 정리했습니다.");
    expect(briefSummary([c("err", "a"), c("err", "b")])).toBeNull();
  });
  it("조사 — 받침 있으면 은, 없으면 는, 한글이 아니면 은(는)", () => {
    expect(topicParticle("특보")).toBe("는");
    expect(topicParticle("현황")).toBe("은");
    expect(topicParticle("CCTV")).toBe("은(는)");
  });
  it("시각 표기 2026.08.25 16:00", () => {
    expect(briefStamp(new Date(2026, 7, 25, 16, 0).toISOString())).toBe("2026.08.25 16:00");
    expect(briefStamp("nope")).toBeNull();
  });
});
