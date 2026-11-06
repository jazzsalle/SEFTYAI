// @vitest-environment jsdom
// R60 — 개발서버(kjw)와 남은 차이 아홉: 답변 평가 · 도움말 글 · 비밀번호 글자 규칙 · 첫 로그인 비밀번호 변경 · 통보문 원문 · 실패 문구 · 상태 문구 · 로그인 기술지원 줄.
// npx vitest run harness/devsync/r60
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as { path: string; json?: unknown }[],
  fail: false,
  logout: vi.fn(async () => {}),
  push: vi.fn(),
}));
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    api: async (path: string, init: { json?: unknown } = {}) => {
      h.calls.push({ path, json: init.json });
      if (h.fail) throw new ApiError(502, "x");
      return { ok: true };
    },
  };
});
vi.mock("@/lib/session", () => ({ useSession: () => ({ account: { id: "busan" }, toast: () => {}, logout: h.logout }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: () => {} }), usePathname: () => "/explore" }));

import AnswerFeedback, { FEEDBACK_KEY, FEEDBACK_MAX } from "@/components/answer/AnswerFeedback";
import { PasswordModal } from "@/components/account/PasswordModal";
import BulletinCard from "@/components/wx/BulletinCard";
import { BASE_BUSY } from "@/components/BasePicker";
import { inspectPw, PW_CHAR_MSG, pwRuleOk } from "@/lib/accountRules";
import { ADMIN_SECTIONS, HELP_SECTIONS, screenHelpOf, searchSections } from "@/lib/help";
import type { WxBulletin } from "@/lib/wxBulletin";

const SRC = join(__dirname, "..", "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

afterEach(() => cleanup());
beforeEach(() => {
  h.calls.length = 0;
  h.fail = false;
  window.localStorage.clear();
});

describe("① 답변 평가(개발서버 AnswerFeedback)", () => {
  it("묻는 줄 · 「도움이 됐어요」 보내면 브라우저에 남아 다시 그려도 「평가해 주셔서 고맙습니다」+[바꾸기]", async () => {
    render(<AnswerFeedback jobId="j1" />);
    expect(screen.getByText("이 답변이 도움이 되었습니까?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /도움이 됐어요/ }));
    await waitFor(() => expect(screen.getByText(/평가해 주셔서 고맙습니다/)).toBeTruthy());
    expect(h.calls[0]).toEqual({ path: "/api/t3q/feedback", json: { jobId: "j1", rating: "GOOD", comment: undefined } });
    expect(JSON.parse(window.localStorage.getItem(FEEDBACK_KEY)!)).toEqual({ j1: "GOOD" });
    cleanup();
    render(<AnswerFeedback jobId="j1" />);
    expect(screen.getByText("도움이 됐어요").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "바꾸기" })).toBeTruthy();
  });
  it("「아쉬워요」는 까닭 칸(500자·예시 문구·[취소]) 먼저, 보내지 못하면 제자리 알림", async () => {
    render(<AnswerFeedback jobId="j2" />);
    fireEvent.click(screen.getByRole("button", { name: /아쉬워요/ }));
    expect(h.calls).toHaveLength(0);
    const box = screen.getByLabelText(/아쉬웠던 까닭/) as HTMLTextAreaElement;
    expect(screen.getByText("(적지 않아도 됩니다)")).toBeTruthy();
    expect(box.maxLength).toBe(FEEDBACK_MAX);
    expect(FEEDBACK_MAX).toBe(500);
    expect(box.placeholder).toBe("예: 물어본 지역이 아닌 곳을 답했습니다.");
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
    h.fail = true;
    fireEvent.change(box, { target: { value: " 지역이 다름 " } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("평가를 보내지 못했습니다. 잠시 뒤 다시 눌러 주십시오."));
    expect(h.calls[0].json).toEqual({ jobId: "j2", rating: "BAD", comment: "지역이 다름" });
    expect(window.localStorage.getItem(FEEDBACK_KEY)).toBeNull();
  });
  it("서버도 까닭을 500자로 자르고, 답 카드는 예전 평가 칸 대신 이것을 쓴다", () => {
    expect(read("app/api/t3q/feedback/route.ts")).toContain("b.comment?.slice(0, 500)");
    const card = read("components/answer/AnswerCard.tsx");
    expect(card).toContain("<AnswerFeedback jobId={job.id} />");
    expect(card).not.toContain("function Feedback(");
  });
});

describe("② 도움말 글(개발서버 helpContent)", () => {
  const all = [...HELP_SECTIONS, ...ADMIN_SECTIONS].flatMap((s) => [s.title, ...s.lines]).join("\n");
  it("개발서버 묶음 — 서비스 범위·질의와 대화·상황 브리핑·AI 모드·특보 배너·계정·글자 크기", () => {
    const titles = HELP_SECTIONS.map((s) => s.title);
    for (const t of ["서비스 범위", "기준지역", "재난상황 조건", "질의와 대화", "상황 브리핑", "AI 모드", "기상특보 배너", "결과 보기", "계정·로그인", "화면 보기 편하게"]) expect(titles).toContain(t);
    expect(all).toContain("로그인하고 4시간이 지나면 자동으로 로그아웃됩니다.");
    expect(all).toContain("[시간 연장]");
    expect(all).toContain("작게·보통·조금 크게·크게·가장 크게");
    expect(ADMIN_SECTIONS.map((s) => s.title)).toContain("등급과 소속");
  });
  it("지금 화면에 없는 기능 설명은 없다", () => {
    for (const gone of ["재난담당자의 하루", "사용중지", "관리이력", "응답 검증", "판정 수정", "CSV", "계정을 선택하면 바로 들어갑니다"]) expect(all).not.toContain(gone);
  });
  it("계정관리는 우리 [계정 발급] 화면(계정 발급자 전용) · 문의처 줄 · 매뉴얼 전환 단추", () => {
    expect(ADMIN_SECTIONS[0].lines.join(" ")).toContain("[계정 발급]");
    const c = read("components/HelpCenter.tsx");
    expect(c).toContain("문의처 · 확정 후 기재");
    expect(c).toContain('"사용자 매뉴얼 보기" : "운영자 매뉴얼 보기"');
  });
  it("검색 — 제목이 걸리면 묶음째, 줄만 걸리면 그 줄만 · 모르는 화면은 통합 탐색", () => {
    expect(searchSections("AI 모드").find((s) => s.id === "aimode")!.lines.length).toBe(HELP_SECTIONS.find((s) => s.id === "aimode")!.lines.length);
    const hit = searchSections("2,000자");
    expect(hit.map((s) => s.id)).toEqual(["agent"]);
    expect(hit[0].lines).toHaveLength(1);
    expect(screenHelpOf("/history").name).toBe("대화 이력");
    expect(screenHelpOf("/contacts").name).toBe("통합 탐색");
  });
});

describe("③ 비밀번호 글자 규칙(개발서버 AccountRules.Inspect)", () => {
  it("영문·숫자·인쇄 가능한 기호 밖(공백·한글)은 거절", () => {
    expect(pwRuleOk("Abcdef12!")).toBe(true);
    expect(pwRuleOk("Abcdef12 !")).toBe(false);
    expect(pwRuleOk("Abcdef12!가")).toBe(false);
    expect(pwRuleOk("Abcdef12\t!")).toBe(false);
    expect(inspectPw("ab 1")).toEqual({ letter: true, digit: true, special: false, other: true });
    expect(inspectPw("~")).toEqual({ letter: false, digit: false, special: true, other: false });
    expect(PW_CHAR_MSG).toBe("비밀번호에는 공백이나 한글을 쓸 수 없습니다.");
    expect(read("lib/server/auth.ts")).toContain("if (inspectPw(newPw).other) return PW_CHAR_MSG;");
  });
});

describe("④ 첫 로그인 비밀번호 변경(개발서버 PasswordChangePage)", () => {
  it("첫 칸 「초기 비밀번호」 · 설명 · 나가는 길은 [로그아웃] · 공백·한글 알림", async () => {
    render(<PasswordModal forced onClose={() => {}} />);
    expect(screen.getByText("새 비밀번호를 설정해야 서비스를 이용할 수 있습니다.")).toBeTruthy();
    expect(screen.getByLabelText("초기 비밀번호")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    fireEvent.change(screen.getByLabelText("초기 비밀번호"), { target: { value: "Init1234!" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "새비밀번호12!a" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "새비밀번호12!a" } });
    fireEvent.click(screen.getByRole("button", { name: "변경" }));
    expect(screen.getByRole("alert").textContent).toBe(PW_CHAR_MSG);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/login"));
    expect(h.logout).toHaveBeenCalled();
  });
  it("평소 변경은 「현재 비밀번호」·[취소]", () => {
    render(<PasswordModal onClose={() => {}} />);
    expect(screen.getByLabelText("현재 비밀번호")).toBeTruthy();
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
  });
});

describe("⑤ 통보문 카드 끝 줄(개발서버 BulletinCard bc-foot)", () => {
  const b: WxBulletin = {
    key: "159|202611071000|3", stnId: "159", stnName: "부산지방기상청", areaLabel: "부산·울산·경남", announcedAt: "2026-11-07T10:00:00+09:00", seq: 3,
    title: "[특보] 제11-3호 : 2026.11.07.10:00 / 호우주의보 발표", areas: "부산", effectiveText: "2026.11.07.11:00", body: "", statusAt: null, statusText: "o 호우주의보 : 부산", preliminary: "", note: "",
  };
  it("[원문 보기] ↔ [원문 접기] · 「자료: 기상청 기상특보 통보문 · 기상청 {지점}」", () => {
    const { container } = render(<BulletinCard b={b} />);
    expect(container.querySelector(".bc-source")!.textContent).toBe("자료: 기상청 기상특보 통보문 · 기상청 부산지방기상청");
    expect(container.querySelector(".bc-raw")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "원문 보기" }));
    const raw = container.querySelector(".bc-raw")!;
    expect([...raw.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["제목", "해당구역", "발효시각", "특보발효현황"]);
    fireEvent.click(screen.getByRole("button", { name: "원문 접기" }));
    expect(container.querySelector(".bc-raw")).toBeNull();
  });
});

describe("⑥⑦⑧ 문구(개발서버 글자 그대로)", () => {
  it("대화 이력 실패 · 체크 저장 실패(되돌림)", () => {
    const hist = read("app/(main)/history/page.tsx");
    expect(hist).toContain("대화 이력을 불러오지 못했습니다.");
    expect(hist).toContain("잠시 후 다시 조회하세요.");
    const sess = read("lib/session.tsx");
    expect(sess).toContain("setCheckInfo(before);");
    expect(sess).toContain("체크를 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
  });
  it("기준지역 잠금 · 지도 대체정보 · 특보 상세 출처 · 브리핑 대기·취소 · 질문 모음 빈 문구 · 로그인 기술지원", () => {
    expect(BASE_BUSY).toBe("답을 기다리는 중에는 기준지역을 바꿀 수 없습니다");
    const map = read("components/map/MapView.tsx");
    expect(map).toContain("지도에 표시된 조회결과가 없습니다. 기준지역 경계만 보입니다.");
    expect(map).toContain("· 공간정보 없음");
    const wx = read("components/wx/WxDetailModal.tsx");
    expect(wx).toContain('"출처를 아직 확인하지 못했습니다."');
    expect(wx).toContain('"갱신 기록 없음"');
    const bb = read("components/explore/BriefBoard.tsx");
    expect(bb).toContain('"차례를 기다리고 있습니다."');
    expect(bb).toContain('"그만두었습니다."');
    const lib = read("components/explore/LibraryDrawer.tsx");
    expect(lib).toContain("시연 질문이 준비되어 있지 않습니다.");
    expect(lib).toContain("이 기준지역에서 쓸 수 있는 질문이 없습니다.");
    expect(read("app/login/page.tsx")).toContain("<p><b>기술지원</b>확정 후 기재</p>");
  });
});
