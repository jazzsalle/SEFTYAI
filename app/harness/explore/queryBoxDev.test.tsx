// @vitest-environment jsdom
// 질의 줄 · 재난상황 조건 창 · 질문 모음 서랍 — 개발서버 QueryBox · ConditionModal · QuestionLibrary 동작 그대로
// npx vitest run harness/explore/queryBoxDev
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s }));
const pins = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/api", () => ({
  api: async (path: string) => {
    if (path === "/api/demo-pins" && pins.fail) throw new Error("서버 DB가 연결되지 않았습니다.");
    return path === "/api/demo-pins" ? { pins: {} } : {};
  },
}));

import Composer, { periodText } from "@/components/explore/Composer";
import LibraryDrawer from "@/components/explore/LibraryDrawer";

afterEach(() => cleanup());

const BUSAN = { sido: { code: "26", name: "부산광역시" }, sigungu: null };
const mount = (cond: Record<string, unknown> = {}) => {
  const setCond = vi.fn();
  session.s = { cond: { base: BUSAN, region: "busan", ...cond }, setCond, toast: vi.fn(), weather: null };
  return setCond;
};

describe("질의 줄(개발서버 QueryBox)", () => {
  it("조건 줄은 재난유형 · 발생기간 · 상황 상세정보만 — 기준시각·「사용자 입력 조건」 표지 없음", () => {
    mount({ referenceTime: "2026-08-25T14:00:00+09:00", conditions: [{ item: "RAIN_1H", value: 30 }] });
    const { container } = render(<Composer onAsk={async () => {}} onBriefing={() => {}} onLibrary={() => {}} />);
    const line = container.querySelector(".cmp-cond")!.textContent!;
    expect(line).toContain("재난유형전체");
    expect(line).toContain("상황 상세정보1개");
    expect(line).not.toContain("기준시각");
    expect(line).not.toContain("사용자 입력 조건");
    expect(screen.queryByRole("button", { name: "기준시각 조건 지우기" })).toBeNull();
    expect(screen.getByRole("button", { name: "브리핑 세트" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "질문" })).toBeTruthy();
  });

  it("발생기간 표기 — 점 · 시각 · 같은 해면 뒤 연도 생략, 없으면 「제한 없음」", () => {
    expect(periodText(new Date(2026, 6, 25, 16).toISOString(), new Date(2026, 7, 25, 16).toISOString())).toBe("2026.07.25 16:00 ~ 08.25 16:00");
    expect(periodText(new Date(2025, 11, 31, 9).toISOString(), new Date(2026, 0, 1, 9).toISOString())).toBe("2025.12.31 09:00 ~ 2026.01.01 09:00");
    expect(periodText("2020-07-23", "2020-07-25")).toBe("2020.07.23 00:00 ~ 07.25 00:00");
    expect(periodText(undefined, undefined)).toBe("제한 없음");
  });

  it("보내면 답을 기다리지 않고 칸을 바로 비운다", async () => {
    mount();
    let done!: () => void;
    const ask = vi.fn(() => new Promise<void>((ok) => (done = ok)));
    render(<Composer onAsk={ask} onBriefing={() => {}} onLibrary={() => {}} />);
    const box = screen.getByRole("textbox", { name: "질문" }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "우리 지역 위험지역은?" } });
    fireEvent.click(screen.getByRole("button", { name: "질의" }));
    expect(ask).toHaveBeenCalledWith("우리 지역 위험지역은?");
    expect(box.value).toBe("");
    await act(async () => done());
  });
});

describe("재난상황 조건 창(개발서버 ConditionModal)", () => {
  it("기준시각 칸·안내문·[취소] 없음, 발생기간에 시각 칸 · [기본 조건으로 되돌리기] = 최근 한 달 · 적용하면 ISO 시각으로", () => {
    const setCond = mount();
    render(<Composer onAsk={async () => {}} onBriefing={() => {}} onLibrary={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "조건 변경" }));
    const dlg = screen.getByRole("dialog", { name: "재난상황 조건" });
    expect(dlg.textContent).not.toContain("기준시각");
    expect(dlg.textContent).not.toContain("입력한 값은 사용자 입력 조건으로");
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    // 기간 없이 열면 「묻지 않음」에 체크, 되돌리면 최근 한 달로 켜진다
    expect((screen.getByRole("checkbox", { name: "발생기간을 묻지 않음" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "기본 조건으로 되돌리기" }));
    expect((screen.getByRole("checkbox", { name: "발생기간을 묻지 않음" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("combobox", { name: "발생기간 시작 시각" }) as HTMLSelectElement).options).toHaveLength(24);
    fireEvent.change(screen.getByLabelText("발생기간 시작 날짜"), { target: { value: "2026.07.25" } });
    fireEvent.change(screen.getByRole("combobox", { name: "발생기간 시작 시각" }), { target: { value: "16:00" } });
    fireEvent.change(screen.getByLabelText("발생기간 끝 날짜"), { target: { value: "2026.08.25" } });
    fireEvent.change(screen.getByRole("combobox", { name: "발생기간 끝 시각" }), { target: { value: "16:00" } });
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(setCond).toHaveBeenCalledWith(expect.objectContaining({
      referenceTime: undefined,
      periodFrom: new Date(2026, 6, 25, 16).toISOString(),
      periodTo: new Date(2026, 7, 25, 16).toISOString(),
    }));
  });

  it("덮개를 눌러도 닫히지 않고 Esc 로 닫힌다", () => {
    mount();
    const { container } = render(<Composer onAsk={async () => {}} onBriefing={() => {}} onLibrary={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "조건 변경" }));
    fireEvent.click(container.querySelector(".xm-layer")!);
    expect(screen.getByRole("dialog", { name: "재난상황 조건" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "재난상황 조건" })).toBeNull();
  });
});

describe("질문 모음 서랍(개발서버 QuestionLibrary)", () => {
  const open = () => {
    mount();
    const onClose = vi.fn();
    render(<LibraryDrawer regionName="부산광역시" onClose={onClose} onAskDemo={() => {}} />);
    return onClose;
  };

  it("늘 「한눈 요약 질의」 갈피로 열고(지역 질문 갈피는 뺌 — 2026-11-24), 열면 서랍에 초점 · Esc 로 닫는다", () => {
    open();
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "질문 모음" }));
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    cleanup();
    const onClose = open();
    expect(screen.queryByRole("tab", { name: "지역 질문" })).toBeNull();
    expect(screen.getByRole("tab", { name: "한눈 요약 질의" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("받아 둘 자리를 읽지 못하면 「저장 자리 없음 · 누르면 실시간으로 묻습니다」", async () => {
    pins.fail = true;
    open();
    fireEvent.click(screen.getByRole("tab", { name: "한눈 요약 질의" }));
    await waitFor(() => expect(screen.getAllByText("저장 자리 없음 · 누르면 실시간으로 묻습니다").length).toBeGreaterThan(0));
    pins.fail = false;
  });
});
