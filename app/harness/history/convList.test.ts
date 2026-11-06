// 대화 이력 목록·대화 만료 규칙(R53 — 개발서버 useConversationList·ConversationService·ConversationRepository 그대로)
// npx vitest run harness/history
import { describe, expect, it } from "vitest";
import type { Conversation } from "@/lib/session";
import {
  NATION, appliedTags, dropTag, filterConvs, initialForm, isExpired, lastTurnAt, pagerPages, toIsoDate, whenLabel, EMPTY_FORM,
} from "@/lib/convList";

const conv = (id: string, title: string, at: string, extra: Partial<Conversation> = {}): Conversation => ({
  id, title, region: "national", createdAt: at, updatedAt: at, v: 2,
  turns: [{ id: `${id}t`, jobId: "j", q: title, source: "USER", at }],
  ...extra,
});
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("처음 조건·딱지", () => {
  it("처음은 최근 일주일(오늘 포함 7일)이고, 기간도 조건이라 딱지 하나", () => {
    const f = initialForm(new Date(2026, 10, 6, 9));
    expect(f.from).toBe("2026.10.31");
    expect(f.to).toBe("2026.11.06");
    expect(appliedTags(f, (_, c) => c)).toEqual([{ key: "from", label: "2026.10.31 ~ 2026.11.06" }]);
  });
  it("지역 딱지는 가장 아래 단계 하나만, 「전국」은 전국", () => {
    const name = (_: string, c: string) => ({ "26": "부산광역시", "26110": "중구" })[c] ?? c;
    expect(appliedTags({ ...EMPTY_FORM, sido: "26", sigungu: "26110" }, name)).toEqual([{ key: "sigungu", label: "중구" }]);
    expect(appliedTags({ ...EMPTY_FORM, sido: NATION }, name)).toEqual([{ key: "sido", label: "전국" }]);
    expect(appliedTags({ ...EMPTY_FORM, keyword: "  침수 " }, name)).toEqual([{ key: "keyword", label: "침수" }]);
  });
  it("딱지를 떼면 그 조건이 풀린다 — 기간은 둘 다, 위 단계를 떼면 아래 단계도", () => {
    expect(dropTag({ ...EMPTY_FORM, from: "2026.11.01", to: "2026.11.06" }, "from")).toMatchObject({ from: "", to: "" });
    expect(dropTag({ ...EMPTY_FORM, sido: "26", sigungu: "26110", emd: "26110101" }, "sido")).toMatchObject({ sido: "", sigungu: "", emd: "" });
    expect(dropTag({ ...EMPTY_FORM, sido: "26", sigungu: "26110", emd: "26110101" }, "sigungu")).toMatchObject({ sido: "26", sigungu: "", emd: "" });
  });
  it("날짜는 점·붙임표·빗금 모두 받고, 알아볼 수 없으면 그대로", () => {
    expect(toIsoDate("2026.7.5")).toBe("2026-07-05");
    expect(toIsoDate("2026/07/25")).toBe("2026-07-25");
    expect(toIsoDate("어제")).toBe("어제");
  });
});

describe("조회", () => {
  const list = [
    conv("a", "부산 호우 대응", local(2026, 11, 6), { baseName: "부산광역시", baseCode: "26" }),
    conv("b", "중구 침수", local(2026, 11, 5), { baseName: "부산광역시 중구", baseCode: "26110" }),
    conv("c", "인제 산사태", local(2026, 10, 20), { baseName: "강원특별자치도 인제군", baseCode: "51810" }),
    conv("d", "전국 특보", local(2026, 11, 4), { baseName: "전국", baseCode: "" }),
    conv("e", "예전 대화", local(2026, 11, 3)), // 기준지역 코드 없음(R53 이전) — region national 이라 전국으로 본다
    conv("f", "예전 부산", local(2026, 11, 2), { region: "busan", baseName: "부산광역시" }), // 코드 모름
  ];
  it("키워드는 대화 제목만(질문 본문은 보지 않음)", () => {
    const withQ = [{ ...list[0], turns: [{ ...list[0].turns[0], q: "침수 지역" }] }];
    expect(filterConvs(withQ, { ...EMPTY_FORM, keyword: "침수" })).toEqual([]);
    expect(filterConvs(list, { ...EMPTY_FORM, keyword: "침수" }).map((c) => c.id)).toEqual(["b"]);
  });
  it("기간은 최종 대화일시 — 끝날은 그날 끝까지, 최근 순", () => {
    const f = { ...EMPTY_FORM, from: "2026.11.04", to: "2026.11.05" };
    expect(filterConvs(list, f).map((c) => c.id)).toEqual(["b", "d"]);
    expect(filterConvs([conv("z", "밤", new Date(2026, 10, 5, 23, 59).toISOString())], f).length).toBe(1);
    expect(filterConvs(list, EMPTY_FORM).map((c) => c.id)).toEqual(["a", "b", "d", "e", "f", "c"]);
  });
  it("시·도만 고르면 그 아래 시·군·구 대화까지, 「전국」은 기준지역이 전국이었던 대화만, 코드를 모르는 대화는 지역 조건에 걸리지 않는다", () => {
    expect(filterConvs(list, { ...EMPTY_FORM, sido: "26" }).map((c) => c.id)).toEqual(["a", "b"]);
    expect(filterConvs(list, { ...EMPTY_FORM, sido: "26", sigungu: "26110" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterConvs(list, { ...EMPTY_FORM, sido: NATION }).map((c) => c.id)).toEqual(["d", "e"]);
  });
  it("제목만 고친 대화는 최종 대화일시가 바뀌지 않는다(마지막 턴 시각)", () => {
    const c = { ...list[2], updatedAt: local(2026, 11, 6) };
    expect(lastTurnAt(c)).toBe(list[2].turns[0].at);
  });
});

describe("대화 만료(T3Q-25 — 마지막 활동 24시간)", () => {
  const now = new Date(2026, 10, 6, 12).getTime();
  it("마지막 질문으로부터 24시간이 지나면 만료, 그 안이면 아님", () => {
    expect(isExpired(conv("a", "x", new Date(now - 24 * 3600_000 - 1000).toISOString()), now)).toBe(true);
    expect(isExpired(conv("a", "x", new Date(now - 23 * 3600_000).toISOString()), now)).toBe(false);
  });
  it("질문이 없거나 대화가 없으면 만료가 아니다", () => {
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired({ ...conv("a", "x", new Date(now - 48 * 3600_000).toISOString()), turns: [] }, now)).toBe(false);
  });
});

describe("표시", () => {
  it("오늘 것은 「오늘 HH:MM」, 아니면 「YYYY.MM.DD」, 없으면 -", () => {
    const now = new Date(2026, 10, 6, 15);
    expect(whenLabel(new Date(2026, 10, 6, 9, 5).toISOString(), now)).toBe("오늘 09:05");
    expect(whenLabel(new Date(2026, 10, 5, 9, 5).toISOString(), now)).toBe("2026.11.05");
    expect(whenLabel(null, now)).toBe("-");
  });
  it("쪽 번호는 지금 자리 둘레 다섯 개", () => {
    expect(pagerPages(1, 3)).toEqual([1, 2, 3]);
    expect(pagerPages(6, 10)).toEqual([4, 5, 6, 7, 8]);
    expect(pagerPages(10, 10)).toEqual([6, 7, 8, 9, 10]);
  });
});
