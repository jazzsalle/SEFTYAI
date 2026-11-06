// @vitest-environment jsdom
// 대화 이력 화면·브리핑 설정 창·질의 줄 만료 안내 — 개발서버 ConversationListPage·BriefingSettingsModal·QueryBox 동작(R53)
// npx vitest run harness/history
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "@/lib/session";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn() }), usePathname: () => "/history" }));
vi.mock("@/components/BasePicker", () => ({
  loadAreas: async (level: string) => (level === "sido" ? [{ code: "26", name: "부산광역시" }, { code: "51", name: "강원특별자치도" }] : level === "sigungu" ? [{ code: "26110", name: "중구" }] : []),
}));
const kv = vi.hoisted(() => ({ saved: null as unknown, fail: false }));
vi.mock("@/lib/api", () => ({
  api: async (path: string, init?: { method?: string; json?: { value?: unknown } }) => {
    if (path.startsWith("/api/kv") && init?.method === "PUT") {
      if (kv.fail) throw new Error("브리핑 설정이 저장되지 않았습니다. 잠시 후 다시 시도하세요.");
      kv.saved = init.json?.value;
      return {};
    }
    return {};
  },
}));

import HistoryPage from "@/app/(main)/history/page";
import { BriefingSettingsModal } from "@/components/briefing/BriefingSettingsModal";

afterEach(() => cleanup());

const today = new Date();
const conv = (id: string, title: string, at: Date, extra: Partial<Conversation> = {}): Conversation => ({
  id, title, region: "national", createdAt: at.toISOString(), updatedAt: at.toISOString(), v: 2,
  turns: [{ id: `${id}t`, jobId: "j", q: title, source: "USER", at: at.toISOString() }], ...extra,
});

describe("대화 이력 목록", () => {
  const old = new Date(today.getTime() - 30 * 864e5);
  const convs = [
    conv("a", "부산 호우 대응", today, { baseName: "부산광역시", baseCode: "26" }),
    conv("b", "지난달 대화", old, { baseName: "강원특별자치도 인제군", baseCode: "51810" }),
  ];

  it("처음은 최근 일주일 — 적용된 조건 1, 기간 딱지를 떼면 전체 기간", async () => {
    session.s = { convs, deleteConvs: vi.fn() };
    render(<HistoryPage />);
    expect(screen.getByText("적용된 조건 1")).toBeTruthy();
    expect(screen.queryByText("지난달 대화")).toBeNull();
    expect(screen.getByText("부산 호우 대응")).toBeTruthy();
    expect(screen.getByText(/^오늘 \d\d:\d\d$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /조건 해제/ }));
    expect(screen.getByText("적용된 조건 0")).toBeTruthy();
    expect(screen.getByText("적용된 필터가 없습니다. 검색 필터를 통해 상세한 검색을 해보세요.")).toBeTruthy();
    expect(screen.getByText("지난달 대화")).toBeTruthy();
    // [초기화]는 조건을 비우는 것이 아니라 기본값(최근 일주일)으로
    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByText("적용된 조건 1")).toBeTruthy();
  });

  it("칸만 고쳐서는 걸리지 않고 [조회]를 눌러야 걸린다 — 맞는 것이 없으면 「조건에 맞는 대화가 없습니다.」", () => {
    session.s = { convs, deleteConvs: vi.fn() };
    render(<HistoryPage />);
    fireEvent.change(screen.getByLabelText("대화 제목"), { target: { value: "없는제목" } });
    expect(screen.getByText("부산 호우 대응")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    expect(screen.getByText("조건에 맞는 대화가 없습니다.")).toBeTruthy();
    expect(screen.getByText("적용된 조건 2")).toBeTruthy();
  });

  it("대화가 하나도 없고 조건도 없으면 「대화 이력이 없습니다.」", () => {
    session.s = { convs: [], deleteConvs: vi.fn() };
    render(<HistoryPage />);
    fireEvent.click(screen.getByRole("button", { name: /조건 해제/ }));
    expect(screen.getByText("대화 이력이 없습니다.")).toBeTruthy();
  });

  it("제목을 누르면 그 대화를 연다", () => {
    session.s = { convs, deleteConvs: vi.fn() };
    render(<HistoryPage />);
    fireEvent.click(screen.getByRole("button", { name: "부산 호우 대응" }));
    expect(nav.push).toHaveBeenCalledWith("/explore?c=a");
  });

  it("선택 삭제 — 확인 창, 실패하면 창을 두고 알림, 성공하면 「대화를 삭제했습니다.」", async () => {
    const del = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(1);
    session.s = { convs, deleteConvs: del };
    render(<HistoryPage />);
    const btn = screen.getByRole("button", { name: "선택 삭제" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("부산 호우 대응 선택"));
    fireEvent.click(btn);
    expect(screen.getByText("선택한 대화 1건을 삭제하시겠습니까?")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "삭제" })));
    expect(screen.getByText("대화가 삭제되지 않았습니다. 잠시 후 다시 시도하세요.")).toBeTruthy();
    expect(screen.getByText("선택한 대화 1건을 삭제하시겠습니까?")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "삭제" })));
    expect(del).toHaveBeenLastCalledWith(["a"]);
    expect(screen.getByText("대화를 삭제했습니다.")).toBeTruthy();
    expect(screen.queryByText("선택한 대화 1건을 삭제하시겠습니까?")).toBeNull();
  });
});

describe("브리핑 설정 창", () => {
  const open = async () => {
    session.s = { account: undefined };
    const onClose = vi.fn();
    await act(async () => {
      render(<BriefingSettingsModal onClose={onClose} />);
    });
    return onClose;
  };

  it("4개 미만 체크로 [저장]하면 그때 알린다(열자마자 혼내지 않음)", async () => {
    await open();
    expect(screen.getByText("4개 선택")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "위험·취약지역 (기본)" }));
    expect(screen.getByText("3개 선택")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("alert").textContent).toContain("브리핑 세트에 넣을 항목을 4개 이상 고르세요.");
  });

  it("고친 채로 닫으면 「브리핑 설정을 그만두시겠습니까?」, 안 고쳤으면 바로 닫힌다", async () => {
    const onClose = await open();
    fireEvent.click(screen.getByRole("button", { name: "위험·취약지역 수정" }));
    expect(screen.getByText("항목명")).toBeTruthy();
    // [적용] 전에 비우면 칸 아래에 알림
    fireEvent.change(screen.getByDisplayValue("위험·취약지역"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(screen.getByText("항목명을 입력하세요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.click(screen.getByRole("button", { name: "과거 피해 이력 아래로" }));
    fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);
    expect(screen.getByText("브리핑 설정을 그만두시겠습니까?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("질의 줄 — 만료된 대화·질문 칸 채우기", () => {
  it("만료된 대화면 「이 대화는 만료되었습니다.」 + 입력·[질의] 막힘, 타일 글은 칸에 들어가기만 한다", async () => {
    const { default: Composer, fillQuery } = await import("@/components/explore/Composer");
    session.s = { cond: { base: null, region: "national" }, toast: vi.fn(), weather: null };
    const ask = vi.fn();
    const r = render(<Composer onAsk={ask} onBriefing={() => {}} onLibrary={() => {}} expired />);
    expect(screen.getByText("이 대화는 만료되었습니다.")).toBeTruthy();
    expect(screen.getByText("새 대화를 시작하세요.")).toBeTruthy();
    expect((r.container.querySelector("textarea") as HTMLTextAreaElement).disabled).toBe(true);
    r.unmount();
    render(<Composer onAsk={ask} onBriefing={() => {}} onLibrary={() => {}} />);
    act(() => fillQuery("우리 지역 위험지역은?"));
    expect(screen.getByDisplayValue("우리 지역 위험지역은?")).toBeTruthy();
    expect(ask).not.toHaveBeenCalled();
    expect(screen.queryByText("이 대화는 만료되었습니다.")).toBeNull();
  });
});
