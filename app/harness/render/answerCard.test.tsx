// @vitest-environment jsdom
// 하네스 — 답변 카드: 개발서버 AnswerPanel(DoneAnswer · TurnAnswer · AnswerTools · AnswerTargets)과 같은 모양·순서(2026-11-19) ·
// 받지 못한 답(answer-error) · 답변 대상 N곳 · 대상지역 N건 · 경고 목록 · 복사(툴바 안 글) · 진행 중 경과 시계 · 도우미(받은 뒤 특보 판정 등)
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
// 한눈 요약(답변 대상 상자의 갈래) — 서버 조회 없이 정해 둔 요약으로. 압축 카드는 따로 시험한다
const summaryState = vi.hoisted(() => ({ value: { kind: "none" } as unknown }));
vi.mock("@/components/summary/useSummary", () => ({ useSummary: () => summaryState.value }));
vi.mock("@/components/summary/CompactSummary", () => ({ default: () => null }));

import AnswerCard, { advisoriesAfter, fmtYmdHm, regionOfRequest, seenAdvisories } from "@/components/answer/AnswerCard";
import { kmaAdvId, legacyAdvIds } from "@/lib/wxMatch";
import { basisTime } from "@/lib/summary";
import { hideDbNames } from "@/lib/answerText";

/** 이 컴퓨터 시간대의 2026-10-28 h:m → ISO(시간대와 무관하게 화면 글자를 맞추려고) */
const local = (h: number, m: number, day = 28) => new Date(2026, 9, day, h, m).toISOString();
const BUSAN = { query_context: { region: { admin_code: "2600000000", level: "SIDO", name: "부산광역시" } } };

const refs: T3qRef[] = [
  { ref: "r1", entity_type: "RISK_FACTOR", display_name: "초량제1지하차도", map: { key: "k", value: "1", draw: "point" } },
  { ref: "r2", entity_type: "REGION", display_name: "범일2", map: { key: "k", value: "2", draw: "polygon" } },
  { ref: "r3", entity_type: "RISK_FACTOR", display_name: "문현지하차도", map: { key: "k", value: "3", draw: "point" } },
];
/** 한눈 요약 — 지하차도 둘 + 기타 하나 */
const SUMMARY = {
  kind: "ok",
  summary: { total: 3, groups: [{ short: "지하차도", rows: [{ id: "s1", name: "초량제1지하차도", ref: refs[0] }, { id: "s3", name: "문현지하차도", ref: refs[2] }] }], others: [{ id: "s2", name: "범일2", ref: refs[1] }] },
};
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
  x = { openCitation: vi.fn(), openDetail: vi.fn(), showOnMap: vi.fn(), openEntity: vi.fn(), selectOnMap: vi.fn(), showSummary: vi.fn(), selectedKey: null, openEvidence: vi.fn(), activeEvidence: null, retry: vi.fn() };
  session.weather = null;
  summaryState.value = { kind: "none" };
  session.toast.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("답변 카드 — 개발서버 AnswerPanel DoneAnswer 와 같은 모양(2026-11-19)", () => {
  it("머리: 아이콘 · 재난안전 AI · 「YYYY.MM.DD HH:mm 기준」(받은 시각) — 처리 시간·시연 시나리오 표지 없음", () => {
    const job = makeJob({ source: "BRIEFING" });
    const scn = { ...BUSAN, weather_warnings: { source: "시연 시나리오(가상 특보)", items: [{ warning_key: "SCN-BS-1", kind: "호우", level: "경보", area: "부산" }] } };
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw(), scn)} />);
    const head = container.querySelector(".acard-h")!;
    expect(head.querySelector(".acard-icon svg")!.getAttribute("width")).toBe("18");
    expect(head.querySelector(".acard-at")!.textContent).toBe(`${basisTime(local(2, 48))} 기준`);
    expect(head.querySelector(".acard-at")!.textContent).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2} 기준$/);
    expect(head.textContent).not.toContain("처리");
    expect(head.textContent).not.toContain("시연 시나리오");
  });

  it("받아 둔 답(재사용)이면 기준시각은 처음 받은 시각", () => {
    const job = makeJob({ id: "job-2", cached_from: "job-0", finished_at: local(20, 50), source_finished_at: local(2, 48) });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".acard-at")!.textContent).toBe(`${basisTime(local(2, 48))} 기준`);
    expect(container.textContent).not.toContain("재사용");
  });

  it("시연 자료 패널: 시연 탭 항목(library_id SH-1-3)의 답에만 답 글 위에 — 보통 답에는 없음, 답 글은 그대로", () => {
    const job = makeJob({ library_id: "SH-1-3" });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const panel = container.querySelector("details.demo-info")!;
    expect(panel).not.toBeNull();
    expect(panel.compareDocumentPosition(container.querySelector(".answer-body")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector(".answer-body .md")!.textContent).toContain("도심 저지대");
    cleanup();
    const plain = makeJob();
    expect(wrap(<AnswerCard job={plain} full={makeFull(plain)} />).container.querySelector(".demo-info")).toBeNull();
  });

  it("하단 단추·원문 상자·자동 조회 카드·주의 줄이 없다 — 원문 보기·답변 복사·마크다운 원문 복사·이어서 묻기·경고 보기", () => {
    session.weather = weather([adv({})]);
    const job = makeJob();
    const full = { ...makeFull(job, makeRaw({ warnings: [{ code: "W1", message: "일부 자료는 지난달 기준입니다" }] })), preview: [{ kind: "x" }] } as unknown as JobFull;
    const { container } = wrap(<AnswerCard job={job} full={full} />);
    expect(container.querySelector(".acard-actions, .rawbox, .ans-caution, .ans-jump, .datacard, .refbox")).toBeNull();
    for (const name of ["원문 보기", "마크다운 원문 복사", "경고 보기 ↓"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByRole("button", { name: /이어서 묻기/ })).toBeNull();
    expect(container.querySelectorAll("input[type=checkbox]").length).toBe(0);
  });

  it("순서: 답 글 → 근거 → 답변 대상 → 「대상지역 N건」 → 경고(목록, 상자 없음) — 정보 부족·한계는 내지 않음", () => {
    summaryState.value = SUMMARY;
    const job = makeJob();
    const full = makeFull(job, makeRaw({ warnings: [{ code: "W1", message: "일부 자료는 지난달 기준입니다" }] }));
    const { container } = wrap(<AnswerCard job={job} full={full} />);
    const body = container.querySelector(".answer-body")!;
    const box = container.querySelector(".ans-refbox")!;
    const note = container.querySelector(".answer-note")!;
    const warns = container.querySelector("ul.answer-warnings")!;
    expect(note.innerHTML).toBe("<strong>대상지역</strong> 3건");
    expect([...warns.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["일부 자료는 지난달 기준입니다"]);
    for (const [a, b] of [[body, box], [box, note], [note, warns]]) expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.textContent).not.toContain("정보 부족");
    expect(container.textContent).not.toContain("유사사례는 예측·위험판단이 아닌 참고 정보");
  });

  it("「대상지역 N건」은 지도에 보일 수 있는 것만 — 하나도 없으면 줄이 없다", () => {
    const job = makeJob();
    const noGeo = refs.map((r) => ({ ...r, map: { ...r.map!, has_geometry: false } })) as unknown as T3qRef[];
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw({ result: { answer: ANSWER, refs: noGeo } }))} />);
    expect(container.querySelector(".answer-note")).toBeNull();
  });

  it("답변 평가는 response_id 가 있을 때만", () => {
    const job = makeJob();
    const a = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(a.container.querySelector(".answer-rate")).toBeNull();
    cleanup();
    const b = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw({ result: { answer: ANSWER, refs, response_id: "resp-1" } }))} />);
    expect(b.container.querySelector(".answer-rate")).not.toBeNull();
  });

  it("받지 못한 답은 정해 둔 문구 한 덩이(머리 없음) + [다시 시도] — 시간 초과·취소·그 밖(유실 등) · 화면을 연 뒤 끝난 작업", () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    for (const [state, msg] of [
      ["TIMEOUT", "질의가 제한 시간을 넘겼습니다. 조건을 좁혀 다시 시도하세요."],
      ["CANCELLED", "질의를 취소했습니다."],
      ["LOST", "답변을 불러오지 못했습니다."],
      ["FAILED", "답변을 불러오지 못했습니다."],
    ] as const) {
      const job = makeJob({ state: state as JobSummary["state"], finished_at: later });
      const raw = makeRaw({ status: "UPSTREAM_ERROR", warnings: [{ code: "E", message: "upstream HTTP 502" }] });
      const { container } = wrap(<AnswerCard job={job} full={makeFull(job, raw)} />);
      const err = container.querySelector(".answer-error[role=alert]")!;
      expect(err.querySelector(".answer-error-text")!.textContent).toBe(msg);
      expect(container.querySelector(".acard-h")).toBeNull();
      expect(container.textContent).not.toContain("502");
      fireEvent.click(within(err as HTMLElement).getByRole("button", { name: "다시 시도" }));
      expect(x.retry).toHaveBeenLastCalledWith("job-1");
      cleanup();
    }
  });

  // 개발서버 useConversation — 다시 연 대화(화면을 열기 전에 끝난 작업)의 받지 못한 질문은 까닭을 가르지 않고 한 문구, 되살린 턴은 [다시 시도] 없음
  it("다시 연 대화의 실패 턴 — 「답변을 받지 못한 질문입니다.」 · 다시 시도 없음", () => {
    for (const state of ["TIMEOUT", "CANCELLED", "FAILED"] as const) {
      const job = makeJob({ state });
      const { container } = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw({ status: "UPSTREAM_ERROR" }))} />);
      expect(container.querySelector(".answer-error")!.textContent).toBe("답변을 받지 못한 질문입니다.");
      expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
      cleanup();
    }
  });

  it("완료됐는데 답 글이 없으면 「답변을 불러오지 못했습니다.」", () => {
    const job = makeJob();
    const raw = makeRaw({ status: "NO_RESULT", result: { refs: [] } });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, raw)} />);
    expect(container.querySelector(".answer-error")!.textContent).toBe("답변을 불러오지 못했습니다.");
  });

  // 개발서버 useConversation — error: isSuccess(envelope) ? null : AnswerFailed (상태가 없거나 SUCCESS 일 때만 답으로 그린다)
  it.each(["PARTIAL_SUCCESS", "NO_RESULT", "DATA_NOT_AVAILABLE"])("응답 상태 %s — 답 글이 와도 그리지 않고 「답변을 불러오지 못했습니다.」 · [다시 시도]만(원문 보기·복사 없음)", (st) => {
    // 화면을 연 뒤 끝난 작업(다시 연 대화의 턴이 아님 — 그때만 [다시 시도])
    const job = makeJob({ t3q_status: st, finished_at: new Date(Date.now() + 60_000).toISOString() });
    const raw = makeRaw({ status: st });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, raw)} />);
    expect(container.querySelector(".answer-error-text")!.textContent).toBe("답변을 불러오지 못했습니다.");
    expect(container.querySelector(".md")).toBeNull();
    expect(screen.queryByRole("button", { name: "원문 보기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "마크다운 원문 복사" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(x.retry).toHaveBeenCalledWith("job-1");
  });

  it("브리핑 항목(brief)이면 「결과를 불러오지 못했습니다.」 — 카드 안 다시 시도 없음(머리의 다시 시도)", () => {
    const job = makeJob({ t3q_status: "PARTIAL_SUCCESS" });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw({ status: "PARTIAL_SUCCESS" }))} noActions brief />);
    expect(container.querySelector("[role=alert]")!.textContent).toBe("결과를 불러오지 못했습니다.");
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("상태 칸이 없는 응답은 답으로 그린다(개발서버 isSuccess — !status)", () => {
    const job = makeJob({ t3q_status: null });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw({ status: undefined }))} />);
    expect(container.querySelector(".md")!.textContent).toContain("도심 저지대");
  });

  it("답 글은 화면 처리(DB 표 이름·정비 내용 칸), 마크다운 원문 복사는 DB 이름만 걷은 글(개발서버 hideDbNames)", async () => {
    const job = makeJob();
    const text = "침수흔적(`flood.trace`) 기준입니다.\n\n| 지구 | 주요 정비 내용 | 등급 |\n|---|---|---|\n| [범일2](#ref:r2) | 우수관로 정비 | 가 |";
    const raw = makeRaw({ result: { answer: text, refs } });
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, raw)} />);
    const md = container.querySelector(".md")!;
    expect(md.textContent).toContain("침수흔적 기준입니다.");
    expect(md.textContent).not.toContain("flood.trace");
    expect([...md.querySelectorAll("th")].map((t) => t.textContent)).toEqual(["지구", "등급"]);
    const tools = within(container.querySelector(".ans-tools") as HTMLElement);
    fireEvent.click(tools.getByRole("button", { name: "답변 복사" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "답변 복사" })).getByRole("menuitem", { name: "마크다운 원문" }));
    expect(writeText).toHaveBeenLastCalledWith(hideDbNames(text));
  });

  it("답 글 속 대상 이름을 누르면 상세 탭을 만들고 지도가 그 대상으로(개발서버 openEntity, R59) — 번호가 다른 이름에 붙은 링크는 글자", () => {
    const job = makeJob();
    const text = "[초량제1지하차도](#ref:r1) 와 [엉뚱한 곳](#ref:r3) · [#ref:r2](#ref:r2)";
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw({ result: { answer: text, refs } }))} />);
    const links = [...container.querySelectorAll(".md button.ref-link")];
    expect(links.map((b) => b.textContent)).toEqual(["초량제1지하차도", "범일2"]);
    expect(container.querySelector(".md")!.textContent).toContain("엉뚱한 곳");
    fireEvent.click(links[0]);
    expect(x.openEntity).toHaveBeenLastCalledWith("job-1", expect.objectContaining({ ref: "r1" }));
    fireEvent.click(links[1]);
    expect(x.openEntity).toHaveBeenLastCalledWith("job-1", expect.objectContaining({ ref: "r2" }));
    expect(x.showOnMap).not.toHaveBeenCalled();
  });

  it("긴 답(2,500자 넘음)만 머리에 [접기] — 접으면 [전체 보기 ▼]", () => {
    const job = makeJob();
    const long = `${ANSWER}\n\n${"가".repeat(2600)}`;
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job, makeRaw({ result: { answer: long, refs } }))} />);
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(container.querySelector(".answer-body.is-folded")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "전체 보기 ▼" }));
    expect(container.querySelector(".answer-body.is-folded")).toBeNull();
    cleanup();
    wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(screen.queryByRole("button", { name: "접기" })).toBeNull();
  });
});

describe("답변 대상 N곳 — 한눈 요약 분류로 묶음(개발서버 AnswerTargets)", () => {
  it("요약이 없으면 상자·도구 메뉴가 없다", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-refbox")).toBeNull();
    expect(within(container.querySelector(".ans-tools") as HTMLElement).queryByRole("button", { name: /답변 대상/ })).toBeNull();
  });
  it("머리 「답변 대상」 · 「N곳」 · 갈래 칩 — 체크박스·[지도에서 모두 보기] 없음, 누르면 그 갈래만", () => {
    summaryState.value = SUMMARY;
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const box = container.querySelector(".ans-refbox")!;
    expect(box.querySelector(".ans-refbox-h b")!.textContent).toBe("답변 대상");
    expect(box.querySelector(".ans-refbox-n")!.textContent).toBe("3곳");
    expect(screen.queryByRole("button", { name: "지도에서 모두 보기" })).toBeNull();
    expect(box.querySelector("input")).toBeNull();
    const chips = [...box.querySelectorAll(".ans-filter button")];
    expect(chips.map((c) => c.textContent)).toEqual(["전체", "지하차도", "기타"]);
    fireEvent.click(chips[2]);
    expect([...box.querySelectorAll(".ans-reflist li > .ans-lnk:not(.ans-lnk--xs)")].map((b) => b.textContent)).toEqual(["범일2"]);
    expect(box.querySelector(".ans-refbox-n")!.textContent).toBe("1곳");
    fireEvent.click(box.querySelector(".ans-reflist .ans-lnk--xs")!);
    expect(x.openEntity).toHaveBeenLastCalledWith("job-1", expect.objectContaining({ ref: "r2" }));
  });
  it("머리 도구 「답변 대상」: 갈래를 고르면 목록을 거르고 상자로 간다", () => {
    summaryState.value = SUMMARY;
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    fireEvent.click(within(container.querySelector(".ans-tools") as HTMLElement).getByRole("button", { name: /답변 대상/ }));
    const menu = screen.getByRole("menu", { name: "답변 대상" });
    expect(within(menu).getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["전체", "지하차도", "기타"]);
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "지하차도" }));
    expect([...container.querySelectorAll(".ans-reflist li > .ans-lnk:not(.ans-lnk--xs)")].map((b) => b.textContent)).toEqual(["초량제1지하차도", "문현지하차도"]);
    expect(document.activeElement).toBe(container.querySelector(".ans-refbox"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("답을 받은 뒤 특보 주의(C9)는 답 카드에 두지 않는다(개발서버) — 판정 함수는 도우미에서", () => {
  it("받은 뒤 그 지역 특보가 발표돼도 주의 줄이 없다", () => {
    session.weather = weather([adv({})]);
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    expect(container.querySelector(".ans-caution")).toBeNull();
    expect(container.textContent).not.toContain("특보 발표");
  });
});

describe("C10 — 답변 복사(머리 도구만, 결과는 툴바 안 글 — 토스트 아님)", () => {
  it("서식 없는 글(마크다운 기호 빼고 글자 그대로, 표는 탭 구분) · 마크다운 원문", async () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={makeFull(job)} />);
    const plain = "결론\n\n부산 도심 저지대)입니다. 초량제1지하차도 · 범일2 · 문현지하차도\n\n구분\t길이\n가 나\t125m";
    const tools = within(container.querySelector(".ans-tools") as HTMLElement);
    fireEvent.click(tools.getByRole("button", { name: "답변 복사" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "답변 복사" })).getByRole("menuitem", { name: "서식 없는 글" }));
    expect(writeText).toHaveBeenLastCalledWith(plain);
    expect(await tools.findByRole("status")).toHaveProperty("textContent", "서식 없는 글로 복사했습니다");
    fireEvent.click(tools.getByRole("button", { name: "답변 복사" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "답변 복사" })).getByRole("menuitem", { name: "마크다운 원문" }));
    expect(writeText).toHaveBeenLastCalledWith(ANSWER);
    expect(await tools.findByText("마크다운 원문을 복사했습니다")).toBeTruthy();
    expect(session.toast).not.toHaveBeenCalled();
  });
});

describe("진행 중", () => {
  it("aria-busy · 경과 시계 「1분 45초」(개발서버 formatElapsed, R63) · 예상 시간·이용 안내 같은 설명 없음", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 2, 47, 45));
    const job = makeJob({ state: "RUNNING", created_at: local(2, 46), finished_at: null });
    const { container } = wrap(<AnswerCard job={job} full={undefined} />);
    // 개발서버 진행 중 모양(answer-running) — 머리줄(「재난안전 AI」·상태 딱지)·카드 테두리 없이 한 줄 + [취소]
    const card = container.querySelector(".answer-running")!;
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(card.textContent).toContain("답변을 만들고 있습니다… 1분 45초");
    expect(card.querySelector("button.answer-cancel")?.textContent).toBe("취소");
    expect(container.querySelector(".acard")).toBeNull();
    expect(container.textContent).not.toContain("재난안전 AI");
    expect(card.textContent).not.toContain("보통");
    expect(card.textContent).not.toContain("기다리는 동안");
  });
  it("완료됐는데 원응답을 아직 못 받았으면 불러오는 중(aria-busy) — 진행 중과 같은 모양", () => {
    const job = makeJob();
    const { container } = wrap(<AnswerCard job={job} full={undefined} />);
    expect(container.querySelector(".answer-running")!.getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("답변을 불러오는 중…");
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
