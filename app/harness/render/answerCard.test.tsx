// @vitest-environment jsdom
// 하네스 — 답변 카드(R25 적용 범위): 센 값·설명 문구 없음 · 처리 시간(제공처 meta.elapsed_ms) · 받은 시각 문자열 그대로 ·
// 경고·정보 부족 바로가기(개수 없음, 알림은 제자리) · C9 받은 뒤 특보(주의일 때만 — 답을 받은 때 발효 중이던 특보 목록에 없던 것) ·
// D5 재사용(받은 시각·지난 시간·받은 뒤 특보 바뀜·새로 받기, 받은 시각을 모르면 시각 없이) · C3 종류 거르기(개수 없음) · C10 복사 · 진행 중 경과 시계
// npx vitest run harness/render
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import { receivedAt, type AgentEnvelope, type JobFull, type JobSummary, type T3qRef, type WxSeen } from "@/lib/jobTypes";
import { ExploreContext, type ExploreApi } from "@/components/explore/ExploreCtx";

const session = vi.hoisted(() => ({
  weather: null as unknown,
  toast: vi.fn(),
  cancel: vi.fn(() => Promise.resolve()),
  medianMs: 95_000,
}));
vi.mock("@/lib/session", () => ({ useSession: () => session }));

import AnswerCard, { advisoriesAfter, fmtYmdHm, regionOfRequest, seenAdvisories } from "@/components/answer/AnswerCard";
import { kmaAdvId, legacyAdvIds } from "@/lib/wxMatch";

/** 이 컴퓨터 시간대의 2026-10-28 h:m → ISO(시간대와 무관하게 화면 글자를 맞추려고) */
const local = (h: number, m: number, day = 28) => new Date(2026, 9, day, h, m).toISOString();
const BUSAN = { query_context: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" } } };

const refs: T3qRef[] = [
  { ref: "r1", entity_type: "RISK_FACTOR", display_name: "초량제1지하차도", map: { key: "k", value: "1", draw: "point" } },
  { ref: "r2", entity_type: "REGION", display_name: "범일2", map: { key: "k", value: "2", draw: "polygon" } },
  { ref: "r3", entity_type: "RISK_FACTOR", display_name: "문현지하차도", map: { key: "k", value: "3", draw: "point" } },
];
const ANSWER = "### 결론\n\n부산 **도심 저지대)**입니다. [초량제1지하차도](#ref:r1) · [범일2](#ref:r2) · [문현지하차도](#ref:r3)\n\n| 구분 | 길이 |\n|---|---|\n| 가<br>나 | 125m |";

function makeRaw(over: Partial<AgentEnvelope> = {}): AgentEnvelope {
  return {
    status: "SUCCESS",
    result: { answer: ANSWER, refs, limitations: ["유사사례는 예측·위험판단이 아닌 참고 정보"] },
    data_gaps: [{ component: "manual", reason: "NOT_IN_SOURCE" }],
    warnings: [],
    meta: { base_time: "2026-10-28T02:48:13+09:00", elapsed_ms: 106_000 },
    ...over,
  };
}
function makeJob(over: Partial<JobSummary> = {}): JobSummary {
  return {
    id: "job-1", account_id: "a", conv_id: "c", turn_no: 1, source: "LIBRARY", library_id: null, question_user: "질문", question_sent: "질문",
    state: "DONE", t3q_status: "SUCCESS", http_status: 200, cached_from: null, retry_of: null, error_code: null,
    created_at: local(2, 46), submitted_at: local(2, 46), finished_at: local(2, 48), elapsed_ms: 110_000, t3q_conversation_id: null, source_finished_at: null,
    // 답을 받은 때 발효 중이던 특보 — 기본은 「없었음」(빈 목록, 모름 = null 과 다르다)
    wx_seen: [], source_wx_seen: null,
    ...over,
  };
}
/** 답을 받은 때 발효 중이던 특보 하나(서버가 남긴 목록의 모양) */
const seenOf = (a: Advisory): WxSeen => ({ id: a.id, type: a.type, level: a.level, regionId: a.regionId ?? null });
const makeFull = (job: JobSummary, raw: AgentEnvelope | null = makeRaw(), request: Record<string, unknown> = BUSAN): JobFull => ({ ...job, request, raw, preview: null, geo: null });
const adv = (over: Partial<Advisory>): Advisory => ({ id: "a1", type: "호우", level: "경보", area: "부산", regionId: "busan", issuedAt: local(3, 10), status: "발효", ...over });
const weather = (advisories: Advisory[], ok = true): WeatherResponse => ({ mode: "live", status: { ok, fetchedAt: local(3, 12), message: "" }, advisories, preliminary: [] });

let x: ExploreApi;
const wrap = (ui: ReactNode) => render(<ExploreContext.Provider value={x}>{ui}</ExploreContext.Provider>);
const writeText = vi.fn((t: string) => Promise.resolve(t));

beforeEach(() => {
  x = { openCitation: vi.fn(), openDetail: vi.fn(), showOnMap: vi.fn(), selectedKey: null, followUp: vi.fn(), retry: vi.fn() };
  session.weather = null;
  session.toast.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("답변 카드 — 받은 값만, 센 값·설명 없음", () => {
  it("머리: 기준 시각은 받은 문자열 그대로, 처리 시간은 제공처 meta.elapsed_ms(「1분 46초」)", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const head = container.querySelector(".acard-h")!;
    expect(head.textContent).toContain("2026-10-28T02:48:13+09:00 기준");
    expect(head.textContent).toContain("처리 1분 46초");
    expect(head.textContent).not.toContain("110초");
  });

  it("답변 대상: 개수·설명 없이 「답변 대상」 — 받은 순서 그대로", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const box = container.querySelector(".refbox")!;
    expect(box.querySelector("b")!.textContent).toBe("답변 대상");
    expect(box.textContent).not.toMatch(/답변 대상\s*\d/);
    expect(box.textContent).not.toContain("에이전트가 답변에 연결한 대상");
    expect([...box.querySelectorAll(".reflist li button.lnk:not(.xs)")].map((b) => b.textContent)).toEqual(["초량제1지하차도", "범일2", "문현지하차도"]);
    expect(container.textContent).not.toContain("유엔이가 센 값");
    expect(container.querySelector("[title*='24시간']")).toBeNull();
  });

  it("경고·정보 부족이 있으면 답 위에 바로가기(개수 없음) — 알림은 제자리(답변 대상 아래), T3Q 고정 안내문 한 줄은 띄우지 않음(사용자 지시)", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const jump = screen.getByRole("button", { name: "경고·정보 부족 보기 ↓" });
    const gaps = container.querySelector(".gaps")!;
    expect(gaps.textContent).toContain("정보 부족: 행동매뉴얼 — 원자료에 없음");
    expect(container.textContent).not.toContain("유사사례는 예측·위험판단이 아닌 참고 정보");
    expect(container.querySelector(".refbox")!.compareDocumentPosition(gaps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(jump.compareDocumentPosition(container.querySelector(".md")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(jump);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(gaps);
  });

  it("한계만 있으면(경고·정보 부족 없음) 바로가기를 두지 않는다", () => {
    const job = makeJob();
    wrap(<AnswerCard job={job} full={makeFull(job, makeRaw({ data_gaps: [] }))} />);
    expect(screen.queryByRole("button", { name: /경고·정보 부족 보기/ })).toBeNull();
  });
});

describe("C9 — 답을 받은 뒤 그 지역 특보 발표(주의일 때만)", () => {
  it("받은 뒤 발표된 그 지역 특보가 있으면 주의 한 줄", () => {
    session.weather = weather([adv({})]);
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-caution")!.textContent).toBe("⚠ 답변을 받은 뒤 특보 발표: 부산 호우경보 10.28. 03:10");
    expect(container.querySelector(".ans-reuse")).toBeNull();
  });
  it("두 건이면 두 건 모두(합치지 않음)", () => {
    session.weather = weather([adv({}), adv({ id: "a2", type: "강풍", level: "주의보", issuedAt: local(3, 20) })]);
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-caution")!.textContent).toBe("⚠ 답변을 받은 뒤 특보 발표: 부산 호우경보 10.28. 03:10 · 부산 강풍주의보 10.28. 03:20");
  });
  it("받기 전에 발표됐거나 다른 지역이거나 특보 조회 실패면 아무것도 두지 않는다", () => {
    for (const w of [weather([adv({ issuedAt: local(2, 40) })]), weather([adv({ regionId: "inje", area: "강원도(인제평지)" })]), weather([adv({})], false)]) {
      session.weather = w;
      const job = makeJob();
      const { container, unmount } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
      expect(container.querySelector(".ans-caution")).toBeNull();
      expect(container.textContent).not.toContain("특보");
      unmount();
    }
  });
  it("답을 받을 때 이미 발효 중이던 특보는 — 다른 지역 특보 발표로 기상청 발표 시각이 뒤로 바뀌어도 — 주의하지 않는다", () => {
    // 부산 호우경보가 답을 받기 전부터 발효 중. 기상청이 새 특보 현황(다른 지역 강풍주의보 추가)을 내면 모든 특보의 발표 시각이 03:10 이 된다
    session.weather = weather([adv({}), adv({ id: "a9", type: "강풍", level: "주의보", area: "제주도", regionId: undefined })]);
    const job = makeJob({ wx_seen: [seenOf(adv({}))] });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-caution")).toBeNull();
    expect(container.textContent).not.toContain("특보");
  });
  it("답을 받을 때의 특보 목록을 모르면(예전 작업·특보 조회 실패) 주의하지 않는다 — 지어내지 않음", () => {
    session.weather = weather([adv({})]);
    const job = makeJob({ wx_seen: null });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-caution")).toBeNull();
  });
  it("같은 지역·같은 특보인데 구역 글자만 바뀌면 그 지역에는 새 특보가 아니다 — 단계가 오르면 새 특보", () => {
    const before = adv({ id: "KMA-호우경보-경상북도(영천,경산)", area: "경상북도(영천, 경산)", regionId: "yeongcheon" });
    const req = { query_context: { region: { admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" } } };
    session.weather = weather([adv({ id: "KMA-호우경보-경상북도(영천,경산,청도)", area: "경상북도(영천, 경산, 청도)", regionId: "yeongcheon" })]);
    const job = makeJob({ wx_seen: [seenOf(before)] });
    const first = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw(), req)} />);
    expect(first.container.querySelector(".ans-caution")).toBeNull();
    first.unmount();
    const was = adv({ id: "KMA-호우주의보-부산", level: "주의보" });
    session.weather = weather([adv({ id: "KMA-호우경보-부산" })]);
    const up = makeJob({ wx_seen: [seenOf(was)] });
    const { container } = wrap(<AnswerCard job={up} full={makeFull(up)} />);
    expect(container.querySelector(".ans-caution")!.textContent).toBe("⚠ 답변을 받은 뒤 특보 발표: 부산 호우경보 10.28. 03:10");
  });
});

describe("D5 — 재사용 답", () => {
  const reusedJob = (over: Partial<JobSummary> = {}) =>
    makeJob({ id: "job-2", cached_from: "job-0", finished_at: local(20, 50), source_finished_at: local(2, 48), wx_seen: null, source_wx_seen: [], ...over });

  it("받은 시각·지난 시간(원래 답을 받은 시각 기준) + 새로 받기 — 받은 뒤 특보가 없으면 「받은 뒤 특보 바뀜」 없음", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 20, 50));
    const job = reusedJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const note = container.querySelector(".ans-reuse")!;
    expect(note.textContent).toContain("이전 답변 재사용 · 2026-10-28 02:48 받은 답(18시간 전)");
    expect(note.textContent).not.toContain("받은 뒤 특보 바뀜");
    expect(note.querySelector("[title]")).toBeNull();
    fireEvent.click(within(note as HTMLElement).getByRole("button", { name: "새로 받기" }));
    expect(x.retry).toHaveBeenCalledWith("job-2");
  });

  it("원래 답을 받은 뒤 그 지역 특보가 발표됐으면 「받은 뒤 특보 바뀜」 + C9 주의 줄", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 3, 30));
    session.weather = weather([adv({})]);
    const job = reusedJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-reuse")!.textContent).toContain("받은 답(42분 전)");
    expect(container.querySelector(".ans-reuse .ans-flag")!.textContent).toBe("받은 뒤 특보 바뀜");
    expect(container.querySelector(".ans-caution")!.textContent).toBe("⚠ 답변을 받은 뒤 특보 발표: 부산 호우경보 10.28. 03:10");
  });

  it("원래 답을 받은 때 이미 발효 중이던 특보면 「받은 뒤 특보 바뀜」·주의 줄 없음(원래 답의 특보 목록으로 본다)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 3, 30));
    session.weather = weather([adv({})]);
    const job = reusedJob({ source_wx_seen: [seenOf(adv({}))] });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-reuse .ans-flag")).toBeNull();
    expect(container.querySelector(".ans-caution")).toBeNull();
  });

  it("원래 답을 받은 시각을 모르면 「이전 답변 재사용」만 — 답의 기준 시각으로 메우지 않고, 받은 뒤 특보도 가리지 않는다", () => {
    session.weather = weather([adv({})]);
    const job = reusedJob({ source_finished_at: null });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const note = container.querySelector(".ans-reuse")!;
    expect(note.querySelector("span")!.textContent).toBe("이전 답변 재사용");
    expect(note.textContent).not.toContain("받은 답");
    expect(note.textContent).not.toContain("02:48");
    expect(container.querySelector(".ans-reuse .ans-flag")).toBeNull();
    expect(container.querySelector(".ans-caution")).toBeNull();
  });

  it("재사용이 아니면 재사용 표시가 없다", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-reuse")).toBeNull();
    expect(container.textContent).not.toContain("재사용");
  });
});

describe("C3 — 답변 대상 종류 거르기(개수 없음)", () => {
  it("목록 위 거르개: 전체 + 받은 종류(받은 순서), 개수 없이 — 누르면 그 종류만", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const chips = [...container.querySelectorAll(".ans-filter button")];
    expect(chips.map((c) => c.textContent)).toEqual(["전체", "잠재 위험요소", "행정구역"]);
    fireEvent.click(chips[2]);
    expect([...container.querySelectorAll(".reflist li button.lnk:not(.xs)")].map((b) => b.textContent)).toEqual(["범일2"]);
    expect(chips[2].getAttribute("aria-pressed")).toBe("true");
  });
  it("머리 도구 「답변 대상」: 종류를 고르면 목록을 거르고 목록으로 간다", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    fireEvent.click(within(container.querySelector(".ans-tools") as HTMLElement).getByRole("button", { name: /답변 대상/ }));
    const menu = screen.getByRole("menu", { name: "답변 대상" });
    expect(within(menu).getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["전체", "잠재 위험요소", "행정구역"]);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "잠재 위험요소" }));
    expect([...container.querySelectorAll(".reflist li button.lnk:not(.xs)")].map((b) => b.textContent)).toEqual(["초량제1지하차도", "문현지하차도"]);
    expect(document.activeElement).toBe(container.querySelector(".refbox"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("C10 — 답변 복사", () => {
  it("서식 없는 글(마크다운 기호 빼고 글자 그대로, 표는 탭 구분) · 마크다운 원문", async () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const foot = within(container.querySelector(".acard-actions") as HTMLElement);
    const plain = "결론\n\n부산 도심 저지대)입니다. 초량제1지하차도 · 범일2 · 문현지하차도\n\n구분\t길이\n가 나\t125m";
    fireEvent.click(foot.getByRole("button", { name: "답변 복사" }));
    expect(writeText).toHaveBeenLastCalledWith(plain);
    fireEvent.click(foot.getByRole("button", { name: "마크다운 원문 복사" }));
    expect(writeText).toHaveBeenLastCalledWith(ANSWER);
    // 머리 도구의 「답변 복사」 펼침 — 서식 없는 글 · 마크다운 원문
    const tools = within(container.querySelector(".ans-tools") as HTMLElement);
    fireEvent.click(tools.getByRole("button", { name: "답변 복사" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "답변 복사" })).getByRole("menuitem", { name: "서식 없는 글" }));
    expect(writeText).toHaveBeenLastCalledWith(plain);
    fireEvent.click(tools.getByRole("button", { name: "답변 복사" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "답변 복사" })).getByRole("menuitem", { name: "마크다운 원문" }));
    expect(writeText).toHaveBeenLastCalledWith(ANSWER);
    await Promise.resolve();
    expect(session.toast).toHaveBeenCalled();
  });
});

describe("진행 중", () => {
  it("aria-busy · 경과 시계 「1분 45초째」 · 예상 시간·이용 안내 같은 설명 없음", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 2, 47, 45));
    const job = makeJob({ state: "RUNNING", created_at: local(2, 46), finished_at: null });
    const { container } = wrap(<AnswerCard job={job} full={undefined} />);
    const card = container.querySelector(".acard")!;
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(card.textContent).toContain("답변을 만드는 중입니다 · 1분 45초째");
    expect(card.textContent).not.toContain("보통");
    expect(card.textContent).not.toContain("기다리는 동안");
  });
  it("완료됐는데 원응답을 아직 못 받았으면 불러오는 중(aria-busy)", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={undefined} />);
    expect(container.querySelector(".acard")!.getAttribute("aria-busy")).toBe("true");
  });
});

describe("도우미", () => {
  it("요청의 기준지역(R32) — region 이름·단계로 시·도·시·군·구(읍·면·동이면 그 시·군·구), 지역 없음 = 전국(null), 요청·이름 없음 = 모름(undefined)", () => {
    expect(regionOfRequest(BUSAN)).toEqual({ sido: "부산광역시", sigungu: null });
    expect(regionOfRequest({ query_context: { region: { admin_code: "2635000000", level: "SIGUNGU", name: "부산광역시 해운대구" } } })).toEqual({ sido: "부산광역시", sigungu: "해운대구" });
    expect(regionOfRequest({ query_context: { region: { admin_code: "5181025000", level: "EMD", name: "강원특별자치도 인제군 인제읍" } } })).toEqual({ sido: "강원특별자치도", sigungu: "인제군" });
    expect(regionOfRequest({ query_context: { region: { admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" } } })).toEqual({ sido: "경상북도", sigungu: "영천시" });
    // 시범 지역 밖도 — 예전에는 모름(null)이라 받은 뒤 특보를 보지 못했다
    expect(regionOfRequest({ query_context: { region: { admin_code: "1100000000", level: "SIDO", name: "서울특별시" } } })).toEqual({ sido: "서울특별시", sigungu: null });
    expect(regionOfRequest({ query_context: {} })).toBeNull();
    expect(regionOfRequest({ query_context: { region: { admin_code: "2611000000" } } })).toBeUndefined();
    expect(regionOfRequest(undefined)).toBeUndefined();
  });
  it("받은 시각 — 재사용이면 원래 답을 받은 시각, 아니면 이 작업이 끝난 시각. 모르면 null(답의 base_time 으로 메우지 않음)", () => {
    const fresh = makeJob();
    expect(receivedAt(fresh, makeFull(fresh))).toBe(local(2, 48));
    const reused = makeJob({ cached_from: "job-0", finished_at: local(20, 50), source_finished_at: local(2, 48) });
    expect(receivedAt(reused, makeFull(reused))).toBe(local(2, 48));
    const unknown = makeJob({ cached_from: "job-0", finished_at: local(20, 50), source_finished_at: null });
    expect(receivedAt(unknown, makeFull(unknown))).toBeNull();
  });
  it("답을 받은 때의 특보 — 재사용이면 원래 답의 것, 아니면 이 작업의 것", () => {
    const seen = [seenOf(adv({}))];
    const fresh = makeJob({ wx_seen: seen });
    expect(seenAdvisories(fresh, makeFull(fresh))).toBe(seen);
    const reused = makeJob({ cached_from: "job-0", wx_seen: null, source_wx_seen: seen });
    expect(seenAdvisories(reused, makeFull(reused))).toBe(seen);
    expect(seenAdvisories(makeJob({ cached_from: "job-0", wx_seen: [], source_wx_seen: null }))).toBeNull();
  });
  it("받은 뒤 특보 — 그때 목록에 없고 발표 시각이 받은 시각보다 뒤인 그 지역 특보만, 전국이면 모든 지역", () => {
    const BS = { sido: "부산광역시", sigungu: null };
    const IJ = { sido: "강원특별자치도", sigungu: "인제군" };
    const w = weather([adv({}), adv({ id: "a2", regionId: "inje", area: "강원도(인제평지)" }), adv({ id: "a3", issuedAt: local(2, 30) })]);
    expect(advisoriesAfter(w, BS, local(2, 48), []).map((a) => a.id)).toEqual(["a1"]);
    expect(advisoriesAfter(w, IJ, local(2, 48), []).map((a) => a.id)).toEqual(["a2"]);
    expect(advisoriesAfter(w, null, local(2, 48), []).map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(advisoriesAfter(w, null, local(2, 48), [seenOf(adv({}))]).map((a) => a.id)).toEqual(["a2"]);
    expect(advisoriesAfter(w, BS, local(2, 48), [seenOf(adv({}))])).toEqual([]);
    expect(advisoriesAfter(w, undefined, local(2, 48), [])).toEqual([]);
    expect(advisoriesAfter(w, BS, null, [])).toEqual([]);
    expect(advisoriesAfter(w, BS, local(2, 48), null)).toEqual([]);
    expect(advisoriesAfter(weather([adv({})], false), BS, local(2, 48), [])).toEqual([]);
  });
  it("받은 뒤 특보 — 시범 지역 밖 기준지역도 같은 규칙(lib/wxMatch). 그때 있던 특보는 특보 id 의 구역 글로 알아본다", () => {
    const JJ = { sido: "제주특별자치도", sigungu: null };
    const sea = adv({ id: "KMA-풍랑주의보-제주도남쪽바깥먼바다", type: "풍랑", level: "주의보", area: "제주도남쪽바깥먼바다", regionId: undefined });
    const far = adv({ id: "KMA-풍랑주의보-동해중부바깥먼바다", type: "풍랑", level: "주의보", area: "동해중부바깥먼바다", regionId: undefined });
    const w = weather([sea, far]);
    expect(advisoriesAfter(w, JJ, local(2, 48), []).map((a) => a.id)).toEqual([sea.id]);
    // 같은 종류·단계가 그 지역에 그때 있었으면(구역 글자가 달라도) 새 특보가 아니다
    const before = { id: "KMA-풍랑주의보-제주도남동쪽안쪽먼바다", type: "풍랑", level: "주의보", regionId: null };
    expect(advisoriesAfter(w, JJ, local(2, 48), [before])).toEqual([]);
    // 다른 지역 같은 특보만 있었으면 새 특보
    expect(advisoriesAfter(w, JJ, local(2, 48), [{ ...seenOf(far), regionId: null }]).map((a) => a.id)).toEqual([sea.id]);
  });
  it("받은 뒤 특보 — 전환용: 예전 판이 괄호 안 괄호 구역을 쪼개 남긴 wx_seen 도 같은 특보로 알아본다(그때 발효 중이던 특보를 새 특보로 보이지 않음)", () => {
    // 기상청 실응답(2026-10-28 05:00 현황)의 한 구역 — 지금은 한 특보(id 하나)
    const area = "전라남도(담양, 장성, 화순, 보성, 광양, 순천, 함평, 영광(낙월면 제외), 나주동남부, 나주서북부, 곡성북부, 곡성남부, 구례평지)";
    const cold = adv({ id: kmaAdvId("한파", "주의보", area), type: "한파", level: "주의보", area, regionId: undefined });
    const w = weather([cold]);
    // 예전 kma.ts 가 같은 현황에서 남긴 id(괄호 안 괄호에서 끊긴 조각들)
    const old: WxSeen[] = ["전라남도(담양,장성,화순,보성,광양,순천,함평,영광(낙월면제외)", "나주동남부", "나주서북부", "곡성북부", "곡성남부", "구례평지)"].map((p) => ({
      id: `KMA-한파주의보-${p}`, type: "한파", level: "주의보", regionId: null,
    }));
    const NJ = { sido: "전남광주통합특별시", sigungu: "나주시" };
    expect(advisoriesAfter(w, null, local(2, 48), old)).toEqual([]);
    expect(advisoriesAfter(w, NJ, local(2, 48), old)).toEqual([]);
    // 조각 일부만 있었으면(그때는 다른 구역 글) 새 특보, 없었으면 새 특보
    expect(advisoriesAfter(w, null, local(2, 48), old.slice(0, 3)).map((a) => a.id)).toEqual([cold.id]);
    expect(advisoriesAfter(w, NJ, local(2, 48), []).map((a) => a.id)).toEqual([cold.id]);
    // 괄호 안 괄호가 없는 구역은 지금 id 하나 그대로
    expect(legacyAdvIds("한파", "주의보", "경상북도(영덕, 포항, 경주남부 제외)")).toEqual([kmaAdvId("한파", "주의보", "경상북도(영덕, 포항, 경주남부 제외)")]);
  });
  it("시각 표기", () => {
    expect(fmtYmdHm(local(2, 48))).toBe("2026-10-28 02:48");
    expect(fmtYmdHm("모름")).toBe("모름");
  });
});
