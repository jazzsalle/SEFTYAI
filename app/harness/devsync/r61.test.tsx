// @vitest-environment jsdom
// R61 — 개발서버(kjw d39f8d8·844333a·548ad7f·7f428c4)와 맞춤: 로그인 화면 · 본문 바로가기(908009) · 비밀번호 변경 토스트(901003) · 검색 로봇 차단(908003).
// 서버 쪽(잠금 문구 902002 · 개발서버 비밀번호 해시 호환)은 r61.server.test.ts
// npx vitest run harness/devsync/r61
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  login: vi.fn(async (id: string, pw: string, force: boolean) => void [id, pw, force]),
  toast: vi.fn(),
  replace: vi.fn(),
  /** 비밀번호 변경 api 의 결과 — ok · net(통신 장애) · bad(서버 문구 있는 400) · down(503) */
  pwMode: "ok" as "ok" | "net" | "bad" | "down" | "same",
}));
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown = null) {
      super(message);
      this.status = status;
      this.body = body;
    }
  }
  return {
    ApiError,
    api: async () => {
      if (h.pwMode === "net") throw new TypeError("Failed to fetch");
      if (h.pwMode === "down") throw new ApiError(503, "서버 DB가 연결되지 않았습니다.");
      if (h.pwMode === "bad") throw new ApiError(400, "현재 비밀번호가 올바르지 않습니다.");
      if (h.pwMode === "same") throw new ApiError(400, "현재 비밀번호와 같은 비밀번호는 사용할 수 없습니다. 다른 비밀번호를 입력하세요.", { code: "AUTH_PASSWORD_SAME" });
      return { ok: true };
    },
  };
});
vi.mock("@/lib/session", () => ({
  useSession: () => ({ ready: true, account: null, login: h.login, toast: h.toast, logout: async () => {} }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: h.replace }), usePathname: () => "/login" }));

import { ApiError } from "@/lib/api";
import LoginPage from "@/app/login/page";
import SkipLink from "@/components/SkipLink";
import { PasswordModal, PW_DONE_MSG, PW_FAIL_MSG, takeNotice } from "@/components/account/PasswordModal";

const SRC = join(__dirname, "..", "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

afterEach(() => cleanup());
beforeEach(() => {
  h.login.mockReset();
  h.toast.mockReset();
  h.replace.mockReset();
  h.pwMode = "ok";
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/login");
  Element.prototype.scrollIntoView = vi.fn();
});

const idBox = () => screen.getByLabelText("아이디") as HTMLInputElement;
const pwBox = () => screen.getByLabelText("비밀번호") as HTMLInputElement;

describe("① 로그인 화면(개발서버 LoginPage)", () => {
  it("짜임: 머리 맨 앞 [본문 바로가기] · 누리집 띠 · 도움말·글자 크기 · 배너 장식 · 칸 둘(자리 글 「내용을 입력하세요」) · 본문 #main-content", () => {
    const { container } = render(<LoginPage />);
    const header = container.querySelector("header")!;
    expect(header.firstElementChild!.className).toBe("skip-link");
    expect(header.firstElementChild!.textContent).toBe("본문 바로가기");
    expect(header.textContent).toContain("이 누리집은 대한민국 공식 전자정부 누리집입니다.");
    expect(screen.getByRole("button", { name: "도움말" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "글자 크기" })).toBeTruthy();
    expect(container.querySelector(".banner-grid[aria-hidden='true']")).toBeTruthy();
    expect(container.querySelector(".banner-glow[aria-hidden='true']")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "로그인" })).toBeTruthy();
    expect(screen.getByText("기관에서 발급받은 아이디와 비밀번호를 입력하세요.")).toBeTruthy();
    expect(idBox().placeholder).toBe("내용을 입력하세요");
    expect(pwBox().placeholder).toBe("내용을 입력하세요");
    expect(pwBox().type).toBe("password");
    const main = container.querySelector("#main-content")!;
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(main.contains(idBox())).toBe(true);
  });

  it("개발서버에 없는 것은 없다: 계정 카드 · 아이디 지우기 · Caps Lock 안내 · 5회 잠금 안내 줄 · 칸별 입력 오류", async () => {
    render(<LoginPage />);
    expect(screen.queryByText("계정 선택")).toBeNull();
    expect(screen.queryByRole("button", { name: "아이디 지우기" })).toBeNull();
    expect(screen.queryByText(/Caps Lock/)).toBeNull();
    expect(screen.queryByText(/5회 잘못 입력/)).toBeNull();
    // 빈 칸으로 눌러도 칸 오류를 내지 않고 서버에 물어 그 문구를 폼 위에 띄운다
    h.login.mockRejectedValueOnce(new ApiError(400, "아이디와 비밀번호를 입력하세요.", null));
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("!아이디와 비밀번호를 입력하세요."));
    expect(screen.queryByText("아이디를 입력하세요.")).toBeNull();
  });

  it("실패: 서버 문구를 폼 위에 · 비밀번호만 비우고 아이디 칸에 초점", async () => {
    render(<LoginPage />);
    h.login.mockRejectedValueOnce(new ApiError(401, "아이디 또는 비밀번호를 잘못 입력했습니다. 다시 입력하세요.", null));
    fireEvent.change(idBox(), { target: { value: " busan " } });
    fireEvent.change(pwBox(), { target: { value: "x-wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("아이디 또는 비밀번호를 잘못 입력했습니다. 다시 입력하세요."));
    expect(h.login).toHaveBeenCalledWith("busan", "x-wrong", false);
    expect(idBox().value).toBe(" busan ");
    expect(pwBox().value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(idBox()));
  });

  it("통신 실패는 「로그인하지 못했습니다.」", async () => {
    render(<LoginPage />);
    h.login.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("로그인하지 못했습니다."));
  });

  it("세션 만료로 오면(?expired=1) 만료 안내", () => {
    window.history.replaceState(null, "", "/login?expired=1");
    render(<LoginPage />);
    expect(screen.getByRole("alert").textContent).toContain("일정 시간 동안 사용하지 않아 로그아웃되었습니다. 다시 로그인하세요.");
  });

  it("비밀번호 보기/숨기기(개발서버 PasswordField — aria-pressed)", () => {
    render(<LoginPage />);
    const eye = screen.getByRole("button", { name: "비밀번호 보기" });
    expect(eye.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(eye);
    expect(pwBox().type).toBe("text");
    expect(screen.getByRole("button", { name: "비밀번호 숨기기" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("다른 곳에서 접속 중이면 확인 창 — [취소]는 비밀번호를 비우고, [기존 접속 종료 후 로그인]은 force 로 다시", async () => {
    render(<LoginPage />);
    h.login.mockRejectedValueOnce(new ApiError(409, "x", { code: "AUTH_SESSION_EXISTS" }));
    fireEvent.change(idBox(), { target: { value: "busan" } });
    fireEvent.change(pwBox(), { target: { value: "pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByText("기존 접속을 끊고 로그인하시겠습니까?")).toBeTruthy());
    expect(screen.getByText("다른 곳에서 이 계정으로 접속 중입니다. 로그인하면 그 접속은 종료됩니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기존 접속 종료 후 로그인" }));
    await waitFor(() => expect(h.login).toHaveBeenLastCalledWith("busan", "pw-1", true));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/explore"));
  });

  it("초기 비밀번호 계정(mustChangePw)은 로그인 뒤 /password 로 간다(개발서버 LoginPage navigate)", async () => {
    render(<LoginPage />);
    h.login.mockImplementationOnce(async () => ({ id: "inje_new", mustChangePw: true }) as never);
    fireEvent.change(idBox(), { target: { value: "inje_new" } });
    fireEvent.change(pwBox(), { target: { value: "Init1234!" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/password"));
    expect(h.replace).not.toHaveBeenCalledWith("/explore");
  });

  it("확인 창 [취소] — 로그인하지 않고 비밀번호를 비운다", async () => {
    render(<LoginPage />);
    h.login.mockRejectedValueOnce(new ApiError(409, "x", { code: "AUTH_SESSION_EXISTS" }));
    fireEvent.change(idBox(), { target: { value: "busan" } });
    fireEvent.change(pwBox(), { target: { value: "pw-1" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "취소" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByText("기존 접속을 끊고 로그인하시겠습니까?")).toBeNull();
    expect(pwBox().value).toBe("");
    expect(h.login).toHaveBeenCalledTimes(1);
  });
});

describe("② [본문 바로가기](908009 — 개발서버 GovHeader skip)", () => {
  it("누르면 주소를 바꾸지 않고 #main-content 로 초점·스크롤", () => {
    render(
      <>
        <SkipLink />
        <main id="main-content" tabIndex={-1}>본문</main>
      </>,
    );
    const link = screen.getByText("본문 바로가기");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => void link.dispatchEvent(ev));
    expect(ev.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe("");
    expect(document.activeElement).toBe(screen.getByText("본문"));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });
  it("본문이 없는 화면에서도 주소를 바꾸지 않고 아무 일 없다", () => {
    render(<SkipLink />);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => void screen.getByText("본문 바로가기").dispatchEvent(ev));
    expect(ev.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe("");
  });
  it("모든 화면 머리 맨 앞에 있고, 본문에 id=main-content tabIndex=-1 이 붙어 있다 · CSS 는 개발서버 .skip-link 값", () => {
    const shell = read("components/AppShell.tsx");
    expect(shell).toMatch(/<header className="gh one">\s*\{\/\*[^*]*\*\/\}\s*<SkipLink \/>/);
    for (const p of ["app/(main)/explore/page.tsx", "app/(main)/history/page.tsx", "app/(main)/admin/page.tsx", "app/(main)/accounts/page.tsx", "app/(main)/contacts/page.tsx", "app/(main)/settings/me/page.tsx"]) {
      expect(read(p), p).toContain('id="main-content" tabIndex={-1}');
    }
    const css = read("components/skipLink.css");
    for (const v of ["padding: 10px 16px;", "background: #1c1c1c;", "transform: translateY(-120%);", "outline: 3px solid #ffe14d;", "outline-offset: -3px;"]) expect(css).toContain(v);
  });
});

describe("③ 비밀번호 변경 토스트(901003 — 개발서버 PasswordChangePage)", () => {
  const fill = (cur: string) => {
    fireEvent.change(screen.getByLabelText(cur), { target: { value: "Old-pass-1" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "New-pass-12" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "New-pass-12" } });
    fireEvent.click(screen.getByRole("button", { name: "변경" }));
  };
  it("문구는 개발서버 글자 그대로", () => {
    expect(PW_DONE_MSG).toBe("비밀번호를 변경했습니다.");
    expect(PW_FAIL_MSG).toBe("비밀번호가 변경되지 않았습니다. 잠시 후 다시 시도하세요.");
  });
  it("사용자 메뉴 변경: 완료하면 창을 닫고 완료 토스트", async () => {
    const onClose = vi.fn();
    render(<PasswordModal onClose={onClose} />);
    fill("현재 비밀번호");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(h.toast).toHaveBeenCalledWith(PW_DONE_MSG);
  });
  it("첫 로그인 변경: 화면을 다시 불러온 뒤 뜨도록 알림을 넘겨 두고(한 번만 꺼냄), 지금은 띄우지 않는다", async () => {
    const onDone = vi.fn();
    render(<PasswordModal forced onClose={() => {}} onDone={onDone} />);
    fill("초기 비밀번호");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(h.toast).not.toHaveBeenCalled();
    expect(takeNotice()).toBe(PW_DONE_MSG);
    expect(takeNotice()).toBeNull();
    expect(read("components/AppShell.tsx")).toContain("const n = takeNotice();");
  });
  it("응답 없는 실패(통신 장애)는 실패 토스트, 창은 그대로", async () => {
    h.pwMode = "net";
    const onClose = vi.fn();
    render(<PasswordModal onClose={onClose} />);
    fill("현재 비밀번호");
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(PW_FAIL_MSG));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("서버 장애(503)처럼 코드를 모르는 응답은 개발서버처럼 첫 칸 아래에 서버 문구(R64)", async () => {
    h.pwMode = "down";
    render(<PasswordModal onClose={() => {}} />);
    fill("현재 비밀번호");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("서버 DB가 연결되지 않았습니다."));
    expect(h.toast).not.toHaveBeenCalled();
  });
  it("서버 문구가 있는 실패는 지금처럼 칸 아래에", async () => {
    h.pwMode = "bad";
    render(<PasswordModal onClose={() => {}} />);
    fill("현재 비밀번호");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("현재 비밀번호가 올바르지 않습니다."));
    expect(h.toast).not.toHaveBeenCalled();
  });
});

describe("⑤ 비밀번호 변경 창 — 개발서버 PasswordChangePage 그대로(R64)", () => {
  it("세 칸이 다 차야 [변경] · 새 비밀번호 칸 위 안내 한 줄 · 규칙 체크 목록·폼 위 알림 없음", () => {
    render(<PasswordModal onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: "변경" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("영문·숫자·특수문자를 모두 넣어 9자 이상, 현재 비밀번호와 다르게 입력하세요.")).toBeTruthy();
    expect(screen.queryByLabelText("비밀번호 규칙")).toBeNull();
    fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "b" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "b" } });
    expect(btn.disabled).toBe(false);
  });
  it("화면에서는 두 칸이 같은지만 본다 — 다르면 확인 칸 아래 「새 비밀번호가 일치하지 않습니다.」, 서버에 안 보냄", async () => {
    render(<PasswordModal onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "변경" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("새 비밀번호가 일치하지 않습니다."));
    expect(screen.getByLabelText("새 비밀번호 확인").getAttribute("aria-invalid")).toBe("true");
  });
  it("서버 코드로 칸을 고른다 — AUTH_PASSWORD_SAME 은 새 비밀번호 칸 아래", async () => {
    h.pwMode = "same";
    render(<PasswordModal onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "Old-pass-1" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "Old-pass-1" } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "Old-pass-1" } });
    fireEvent.click(screen.getByRole("button", { name: "변경" }));
    await waitFor(() => expect(screen.getByLabelText("새 비밀번호").getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByRole("alert").textContent).toBe("현재 비밀번호와 같은 비밀번호는 사용할 수 없습니다. 다른 비밀번호를 입력하세요.");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("새 비밀번호")));
  });
});

describe("④ 검색 로봇 차단(908003)", () => {
  it("robots.txt 「User-agent: * / Disallow: /」 · 머리 메타 noindex,nofollow", () => {
    expect(readFileSync(join(__dirname, "..", "..", "public", "robots.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("User-agent: *\nDisallow: /\n");
    expect(read("app/layout.tsx")).toContain("robots: { index: false, follow: false }");
  });
});
