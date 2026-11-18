// @vitest-environment jsdom
// /password — 개발서버 router /password · PasswordChangePage: 누리집 띠 + 접은 머리 + 빈 본문(inert) 위에 비밀번호 변경 창
// npx vitest run harness/devsync/pwPage
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ s: {} as Record<string, unknown>, replace: vi.fn() }));
vi.mock("@/lib/session", () => ({ useSession: () => h.s }));
vi.mock("@/lib/api", () => ({ ApiError: class extends Error {}, api: async () => ({ ok: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: h.replace }), usePathname: () => "/password" }));

import PasswordPage from "@/app/password/page";

afterEach(() => {
  cleanup();
  h.replace.mockReset();
});
const base = { ready: true, toast: vi.fn(), toastMsg: null, logout: async () => {} };

describe("/password 화면", () => {
  it("초기 비밀번호 계정 — 「초기 비밀번호 변경」 창, 뒤 화면은 inert(누리집 띠 · 빈 본문), 나가는 길은 [로그아웃]뿐", () => {
    h.s = { ...base, account: { id: "inje_new", mustChangePw: true } };
    const { baseElement } = render(<PasswordPage />);
    const behind = baseElement.querySelector(".screen-behind")!;
    expect(behind.hasAttribute("inert")).toBe(true);
    expect(behind.textContent).toContain("이 누리집은 대한민국 공식 전자정부 누리집입니다.");
    expect(behind.querySelector("main.screen-behind-body")).toBeTruthy();
    expect(screen.getByText("초기 비밀번호 변경")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
  });

  it("스스로 들어온 경우 — 「비밀번호 변경」 창, [취소]면 /explore 로", () => {
    h.s = { ...base, account: { id: "busan", mustChangePw: false } };
    render(<PasswordPage />);
    expect(screen.getByText("비밀번호 변경")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(h.replace).toHaveBeenCalledWith("/explore");
  });

  it("로그인 전이면 /login", () => {
    h.s = { ...base, account: null };
    render(<PasswordPage />);
    expect(h.replace).toHaveBeenCalledWith("/login");
  });
});
