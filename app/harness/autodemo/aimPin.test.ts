// 자동 시연 AI 모드 장면 — 받아 둔 답의 두 꼴(우리 T3Q 봉투 · 개발서버에서 가져온 AiModeView, R55)을 같은 창 점검으로 그린다
// npx vitest run harness/autodemo/aimPin.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIM_DEMO, aimAnswerOf, aimDemoView, aimNoWarnOf } from "@/lib/autoDemoAim";

const it0 = AIM_DEMO[0];

describe("AI 모드 장면 받아 둔 답", () => {
  it("우리 봉투는 result.answer, 개발서버 점검 꼴은 answer 를 그대로 읽는다", () => {
    expect(aimAnswerOf({ status: "SUCCESS", result: { answer: "가" } })).toBe("가");
    const dev = { checkId: "DEMO-X", answer: "나", noWarningMessage: null, guides: [{ sortNo: 0, message: "나" }], warnings: [] };
    expect(aimAnswerOf(dev)).toBe("나");
    expect(aimNoWarnOf(dev)).toBeNull();
    expect(aimNoWarnOf({ result: { no_warning_message: "다" } })).toBe("다");
    // guides 가 없는 낯선 꼴은 읽지 않는다
    expect(aimAnswerOf({ answer: "라" })).toBeUndefined();
    expect(aimAnswerOf(null)).toBeUndefined();
  });

  it("어느 꼴이든 창 점검은 가상 특보 하나·안내 하나", () => {
    const v = aimDemoView(it0, aimAnswerOf({ checkId: "c", answer: "안내 글", guides: [] }), null);
    expect(v.guides).toHaveLength(1);
    expect(v.guides[0]).toMatchObject({ message: "안내 글", warningKey: it0.warning.key });
    expect(v.warnings[0]).toMatchObject({ warningKey: it0.warning.key, scenario: true });
  });

  it("가져오기 도구가 읽는 정의 줄 꼴이 AIM_DEMO 와 맞는다(harness/demo/import_pins.mjs)", () => {
    const src = readFileSync(new URL("../../src/lib/autoDemoAim.ts", import.meta.url), "utf8");
    const got = [...src.matchAll(/\{ id: "(AIM-[^"]+)",[^\n]*?adminCode: "(\d+)",[^\n]*?key: "([^"]+)"/g)].map((m) => [m[1], m[2], m[3]]);
    expect(got).toEqual(AIM_DEMO.map((x) => [x.id, x.adminCode, x.warning.key]));
  });
});
