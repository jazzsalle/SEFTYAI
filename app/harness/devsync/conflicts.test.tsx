// @vitest-environment jsdom
// 예전 결정과 부딪히던 넷을 개발서버(kjw 998facb)대로(R57) — 질문 칸 잠금 · 남은 시간·[시간 연장] · (작업 8분은 harness/jobs) · 누리집 띠.
// npx vitest run harness/devsync
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { askLockOf, countRunning, MAX_PARALLEL } from "@/lib/askLock";
import { formatLeft, SessionCountdown } from "@/components/account/SessionCountdown";
import GovMasthead from "@/components/GovMasthead";

vi.mock("@/lib/session", () => ({ useSession: () => ({ cond: { base: null, region: "national" }, setCond: () => {}, toast: () => {} }) }));
vi.mock("@/lib/briefing", () => ({ useBriefItems: () => [] }));
vi.mock("@/components/explore/CondModal", () => ({ default: () => null, useClearMeasuresOnNation: () => {} }));
vi.mock("@/components/briefing/BriefingSettingsModal", () => ({ openBriefingSettings: () => {} }));

afterEach(cleanup);

describe("질문 칸 잠금(개발서버 SearchPage askLocked)", () => {
  const st: Record<string, string> = { a: "RUNNING", b: "QUEUED", c: "SUBMITTED", d: "RUNNING", e: "DONE", f: "FAILED" };
  const of = (id: string) => st[id];

  it("개별 질문 넷이 다 돌면 막는다 — 끝난 것·접수 실패·상태를 모르는 턴은 세지 않는다", () => {
    expect(MAX_PARALLEL).toBe(4);
    const three = [{ jobId: "a" }, { jobId: "b" }, { jobId: "c" }, { jobId: "e" }, { jobId: "f" }, { jobId: "zz" }, { jobId: "", error: "접수 실패" }];
    const n3 = countRunning(three, of);
    expect(n3).toEqual({ single: 3, briefing: 0 });
    expect(askLockOf(n3)).toEqual({ running: true, briefingRunning: false, locked: false, free: 1 });
    const n4 = countRunning([...three, { jobId: "", pending: true }], of);
    expect(askLockOf(n4).locked).toBe(true);
    expect(askLockOf(n4).free).toBe(0);
  });

  it("브리핑 세트가 하나라도 돌면 개별 질문이 없어도 막는다 · 다 끝나면 풀린다", () => {
    const g = { id: "b1", no: 1, total: 4, title: "현재 상황 브리핑" };
    const running = countRunning([{ jobId: "d", group: g }, { jobId: "e", group: g }], of);
    expect(running).toEqual({ single: 0, briefing: 1 });
    expect(askLockOf(running)).toMatchObject({ running: false, briefingRunning: true, locked: true });
    expect(askLockOf(countRunning([{ jobId: "e", group: g }, { jobId: "f", group: g }], of)).locked).toBe(false);
  });

  it("막히면 질문 칸·[질의]가 잠기고 단추는 「질의 중…」, 안내 글은 「질문을 입력하세요.」만 · [브리핑 세트]도 막는다", async () => {
    const { default: Composer } = await import("@/components/explore/Composer");
    const props = { onAsk: async () => {}, onBriefing: () => {}, onLibrary: () => {} };
    const { rerender } = render(<Composer {...props} />);
    const box = screen.getByPlaceholderText("질문을 입력하세요.") as HTMLTextAreaElement;
    expect(box.disabled).toBe(false);
    expect(screen.queryByText(/다른 질문도 이어서 보낼 수 있습니다/)).toBeNull();
    expect(screen.getByRole("button", { name: "질의" })).toBeTruthy();
    rerender(<Composer {...props} locked briefDisabled />);
    expect((screen.getByPlaceholderText("질문을 입력하세요.") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "질의 중…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "브리핑 세트 ▾" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("로그아웃까지 남은 시간·[시간 연장](개발서버 UserMenu SessionCountdown)", () => {
  it("한 시간 넘게 남으면 H:MM:SS, 그 밖은 MM:SS(개발서버 format)", () => {
    expect(formatLeft(240 * 60_000)).toBe("4:00:00");
    expect(formatLeft(239 * 60_000 + 59_000)).toBe("3:59:59");
    expect(formatLeft(59 * 60_000 + 5_000)).toBe("59:05");
    expect(formatLeft(0)).toBe("00:00");
  });

  it("남은 시간·「N분 남음」(보조기기)·[시간 연장] → 「연장 중…」", async () => {
    let done: (v: boolean) => void = () => {};
    const onExtend = vi.fn(() => new Promise<boolean>((r) => (done = r)));
    render(<SessionCountdown expiresAt={Date.now() + 90 * 60_000 - 500} onExtend={onExtend} />);
    expect(screen.getByText("로그아웃까지 남은 시간")).toBeTruthy();
    expect(screen.getByText("90분 남음")).toBeTruthy();
    expect(screen.getByText(/^1:29:5\d$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "시간 연장" }));
    expect(onExtend).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "연장 중…" }) as HTMLButtonElement).disabled).toBe(true);
    done(true);
    expect(await screen.findByRole("button", { name: "시간 연장" })).toBeTruthy();
  });

  it("끝나는 시각을 모르면 그리지 않는다", () => {
    const { container } = render(<SessionCountdown expiresAt={null} onExtend={async () => true} />);
    expect(container.textContent).toBe("");
  });
});

describe("공식 누리집 띠(개발서버 GovHeader masthead)", () => {
  it("글자 그대로", () => {
    render(<GovMasthead />);
    expect(screen.getByText("이 누리집은 대한민국 공식 전자정부 누리집입니다.")).toBeTruthy();
  });
});
