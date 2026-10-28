// @vitest-environment jsdom
// 하네스 — 유사재난 사례 카드(SimilarEventsCard): 받은 순서 · 받은 값만 · 사건 요약(A10) 전부 동시에 · 줄마다 받는 중/실패 ·
// 사건 상세 열기 · 모든 항목 보기(받은 키 전부, coverage 포함) · 제공처 문구 그대로 · 덧붙인 설명 없음
// 값: 녹화 harness/recordings/a10_similar_details_*.json (유사사례 검색 1건 + 사건 상세 20건)
// npx vitest run harness/similar
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SimilarEventsCard from "@/components/answer/cards/SimilarEventsCard";
import { ExploreContext, type ExploreApi } from "@/components/explore/ExploreCtx";
import type { PreviewItem } from "@/lib/jobTypes";
import { fieldKo } from "@/lib/labels";

type Rec = { method: string; path: string; body: { query_context?: Record<string, unknown> } | null; response: Record<string, unknown> };
const REC = JSON.parse(readFileSync(join(__dirname, "..", "recordings", "a10_similar_details_2026-10-27T22-21-15-740Z.json"), "utf8")) as Rec[];
const SEARCH = REC[0];
const DETAILS = new Map(REC.slice(1).map((e) => [decodeURIComponent(e.path.replace(/^\/events\//, "")), e.response]));
type Item = Record<string, unknown> & { event_master_id: string; display_name: string };
const ITEMS = (SEARCH.response.result as { items: Item[] }).items;

/** 시험마다 다른 사건 ID(공용 저장소가 앞 시험에서 받은 것을 다시 쓰지 않게) — 「원래 ID__꼬리」 */
const tagged = (tag: string): PreviewItem => {
  const res = JSON.parse(JSON.stringify(SEARCH.response)) as { result: { items: Item[] } };
  for (const it of res.result.items) it.event_master_id = `${it.event_master_id}__${tag}`;
  return { api: "SIMILAR_EVENT", apiId: "T3Q-04", label: "유사재난 사례", path: SEARCH.path, request: SEARCH.body, http: 200, ms: 748, response: res as PreviewItem["response"] };
};
const baseId = (id: string) => id.replace(/__[a-z0-9]+$/, "");
const jsonRes = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;
const okRes = (envelope: unknown, http = 200) => jsonRes(200, { api: "T3Q-10", http, ms: 1, envelope });

const mockExplore = (): ExploreApi => ({ openCitation: vi.fn(), openDetail: vi.fn(), showOnMap: vi.fn(), selectedKey: null, followUp: vi.fn(), retry: vi.fn() });
const show = (p: PreviewItem, x = mockExplore()) => ({
  x,
  ...render(
    <ExploreContext.Provider value={x}>
      <SimilarEventsCard p={p} />
    </ExploreContext.Provider>,
  ),
});
const rowsOf = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".sim-row")];
const topOf = (c: HTMLElement) => c.querySelector<HTMLElement>(".sim-top")!;
const sumOf = (el: HTMLElement) => el.querySelector<HTMLElement>(".sim-sum")!;

/** 사건 상세 받기 — 녹화된 봉투 그대로(꼬리 뗀 ID 로 찾음). 보낸 순서·ID 를 남긴다 */
const never = () => new Promise<Response>(() => {});
const stubDetails = (override: (id: string) => Response | Promise<Response> | null = () => null) => {
  const sent: string[] = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    const { id } = JSON.parse(String(init?.body)) as { api: string; id: string };
    sent.push(id);
    return override(id) ?? okRes(DETAILS.get(baseId(id)));
  });
  vi.stubGlobal("fetch", fn);
  return { fn, sent };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("유사재난 사례 카드 — 배치", () => {
  it("녹화: 사건 20건, 사건 상세 20건", () => {
    expect(ITEMS.length).toBe(20);
    expect(ITEMS.every((it) => DETAILS.has(it.event_master_id))).toBe(true);
  });

  it("첫 사건은 카드 — 받은 값만(사건 · 시작 ~ 종료 둘 다 · 대표지역 · 진행 상태 · 순위 · 유사도 점수 · 척도)", () => {
    stubDetails(never);
    const { container } = show(tagged("top"));
    const top = topOf(container);
    expect(top.querySelector(".sim-name")!.textContent).toBe("2021년 08.25~08.25 호우");
    // 시작 = 종료여도 둘 다 받은 글자 그대로
    expect(top.querySelector(".sim-meta")!.textContent).toBe("2021-08-25 ~ 2021-08-25 · 대표지역 부산광역시 · 종료");
    expect(top.querySelector(".sim-rank")!.textContent).toBe("1위");
    expect(top.querySelector(".sim-top-h .sim-score")!.textContent).toBe("유사도 96.67 · 척도 0~100");
  });

  it("둘째부터 줄 — 받은 순서 그대로, 줄마다 같은 항목(대표지역은 이름이 온 줄에만)", () => {
    stubDetails(never);
    const { container } = show(tagged("rows"));
    const rows = rowsOf(container);
    expect(rows.map((r) => r.querySelector(".sim-name")!.textContent)).toEqual(ITEMS.slice(1).map((it) => it.display_name));
    expect(rows[0].querySelector(".sim-meta")!.textContent).toBe("2016-07-31 ~ 2016-08-01 · 종료");
    expect(rows[0].querySelector(".sim-score")!.textContent).toBe("2위 · 유사도 90.91 · 척도 0~100");
    // 같은 점수·같은 날짜도 줄마다 그대로(합치지 않음)
    expect(rows[1].querySelector(".sim-meta")!.textContent).toBe("2020-07-10 ~ 2020-07-10 · 종료");
    expect(rows[8].querySelector(".sim-score")!.textContent).toBe("10위 · 유사도 70 · 척도 0~100");
    expect(rows[9].querySelector(".sim-score")!.textContent).toBe("11위 · 유사도 70 · 척도 0~100");
    // 16위 — 대표지역이 온 줄
    expect(rows[14].querySelector(".sim-meta")!.textContent).toBe("2018-08-06 ~ 2018-08-07 · 대표지역 강원특별자치도 · 종료");
  });

  it("덧붙인 설명·센 값 없음 · 영문 툴팁 없음", () => {
    stubDetails(never);
    const { container } = show(tagged("plain"));
    const text = container.textContent ?? "";
    for (const bad of ["유엔이", "제공처 한계", "받는 중", "읽는 법", "대표지역이 비어", "사건 상세에서", "유의 사항", "순위에 반영"]) expect(text).not.toContain(bad);
    for (const el of container.querySelectorAll("[title]")) expect(el.getAttribute("title")).not.toMatch(/[A-Za-z]/);
  });
});

describe("유사재난 사례 카드 — 사건 요약(A10)", () => {
  it("목록 사건 전부의 사건 상세를 한꺼번에 보낸다(하나도 받기 전에 20건 모두) — 받는 동안은 회색 줄만, 받으면 요약 그대로", async () => {
    const waiting: { id: string; resolve: (r: Response) => void }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve) => {
            const { id } = JSON.parse(String(init?.body)) as { id: string };
            waiting.push({ id, resolve });
          }),
      ),
    );
    const p = tagged("all");
    const { container } = show(p);
    await waitFor(() => expect(waiting.length).toBe(20));
    expect(waiting.map((w) => w.id)).toEqual((p.response!.result!.items as Item[]).map((it) => it.event_master_id));
    // 받는 중 — 20칸 모두 회색 줄, 글자 없음
    const sums = [sumOf(topOf(container)), ...rowsOf(container).map(sumOf)];
    expect(sums.length).toBe(20);
    for (const s of sums) {
      expect(s.getAttribute("aria-busy")).toBe("true");
      expect(s.querySelector(".sim-sk")).not.toBeNull();
      expect(s.textContent).toBe("");
    }
    for (const w of waiting) w.resolve(okRes(DETAILS.get(baseId(w.id))));
    await waitFor(() => expect(container.querySelectorAll(".sim-sk").length).toBe(0));
    const want = ITEMS.map((it) => (DETAILS.get(it.event_master_id) as { result: { event_summary: string } }).result.event_summary);
    expect([sumOf(topOf(container)), ...rowsOf(container).map(sumOf)].map((s) => s.textContent)).toEqual(want);
    expect(sumOf(topOf(container)).textContent).toBe("호우 · 부산 · 이재민 3명 · 재산피해 506,300,000원");
  });

  it("받지 못한 줄만 「요약을 불러오지 못했습니다」 — 연결 실패·찾을 수 없음 봉투. 성공 봉투에 요약이 비어 오면 「—」", async () => {
    const [, second, third, fourth] = ITEMS.map((it) => it.event_master_id);
    stubDetails((id) => {
      const b = baseId(id);
      if (b === second) return jsonRes(502, { error: "T3Q 연결 실패" });
      if (b === third) return okRes({ status: "NOT_FOUND", result: null, warnings: [{ code: "NOT_FOUND", message: "없음" }] }, 404);
      if (b === fourth) return okRes({ status: "SUCCESS", result: { event_summary: null } });
      return null;
    });
    const { container } = show(tagged("fail"));
    await waitFor(() => expect(container.querySelectorAll(".sim-sk").length).toBe(0));
    const rows = rowsOf(container);
    expect(sumOf(rows[0]).textContent).toBe("요약을 불러오지 못했습니다");
    expect(sumOf(rows[1]).textContent).toBe("요약을 불러오지 못했습니다");
    expect(sumOf(rows[2]).textContent).toBe("—");
    expect(container.querySelectorAll(".sim-fail").length).toBe(2);
    // 나머지는 받은 그대로
    expect(sumOf(topOf(container)).textContent).toBe("호우 · 부산 · 이재민 3명 · 재산피해 506,300,000원");
    expect(sumOf(rows[3]).textContent).toBe("호우 · 부산, 전북, 경남 · 재산피해 23,000,000원");
  });

  it("같은 목록을 다시 그려도 다시 보내지 않는다", async () => {
    const { fn } = stubDetails();
    const p = tagged("again");
    const first = show(p);
    await waitFor(() => expect(first.container.querySelectorAll(".sim-sk").length).toBe(0));
    expect(fn).toHaveBeenCalledTimes(20);
    first.unmount();
    const second = show(p);
    expect(second.container.querySelectorAll(".sim-sk").length).toBe(0);
    expect(fn).toHaveBeenCalledTimes(20);
  });
});

describe("유사재난 사례 카드 — 열기 · 모든 항목 보기 · 제공처 문구", () => {
  it("사건(이름·칸)을 누르면 사건 상세 — 표 카드와 같은 호출(사건 상세 · 받은 ID · 사건 이름 · 비교 조건)", () => {
    stubDetails(never);
    const p = tagged("open");
    const { container, x } = show(p);
    const qc = (p.request as { query_context: Record<string, unknown> }).query_context;
    fireEvent.click(topOf(container).querySelector(".sim-name")!);
    expect(x.openDetail).toHaveBeenLastCalledWith("T3Q-10", `${ITEMS[0].event_master_id}__open`, ITEMS[0].display_name, qc);
    fireEvent.click(rowsOf(container)[4]);
    expect(x.openDetail).toHaveBeenLastCalledWith("T3Q-10", `${ITEMS[5].event_master_id}__open`, ITEMS[5].display_name, qc);
    expect(x.openDetail).toHaveBeenCalledTimes(2);
  });

  it("모든 항목 보기 — 받은 키 전부(한국어 열 이름), 비교에 쓴 요인 비율(coverage) 포함 · 행을 누르면 사건 상세", () => {
    stubDetails(never);
    const { container, getByText, x } = show(tagged("allf"));
    fireEvent.click(getByText("모든 항목 보기"));
    const heads = [...container.querySelectorAll("th")].map((th) => th.textContent);
    expect(heads).toEqual(Object.keys(ITEMS[0]).map(fieldKo));
    const trs = container.querySelectorAll("tbody tr");
    expect(trs.length).toBe(20);
    expect(trs[0].textContent).toContain("비교에 쓴 요인 비율: 0.75");
    expect(trs[1].textContent).toContain("비교에 쓴 요인 비율: 0.55");
    // 객체는 키 전부 — 대표지역의 행정코드도(이름만 꺼내 옆 키를 숨기지 않음)
    expect(trs[0].textContent).toContain("행정코드: 2600000000 · 이름: 부산광역시");
    for (const el of container.querySelectorAll("[title]")) expect(el.getAttribute("title")).not.toMatch(/[A-Za-z]/);
    fireEvent.click(trs[2]);
    expect(x.openDetail).toHaveBeenLastCalledWith("T3Q-10", `${ITEMS[2].event_master_id}__allf`, ITEMS[2].display_name, expect.anything());
    // 키보드 — 행마다 사건 이름 칸이 단추(Enter·Space 의 클릭이 행으로 올라가 사건 상세를 연다)
    const names = [...container.querySelectorAll<HTMLButtonElement>("tbody tr td button.lnk")];
    expect(names.map((b) => b.textContent)).toEqual(ITEMS.map((it) => it.display_name));
    expect(names.every((b) => b.type === "button")).toBe(true);
    fireEvent.click(names[3]);
    expect(x.openDetail).toHaveBeenLastCalledWith("T3Q-10", `${ITEMS[3].event_master_id}__allf`, ITEMS[3].display_name, expect.anything());
    fireEvent.click(getByText("주요 항목만"));
    expect(rowsOf(container).length).toBe(19);
  });

  it("제공처 경고·정보 부족 — 받은 문구 그대로", () => {
    stubDetails(never);
    const { container } = show(tagged("gaps"));
    const text = container.querySelector(".gaps")!.textContent ?? "";
    for (const w of SEARCH.response.warnings as { message: string }[]) expect(text).toContain(w.message);
    expect(text).toContain("원자료에 없음");
  });
});
