// @vitest-environment jsdom
// 질문 목록(QueuePanel)·특보 줄(WxBar) — R39·R40
//  · 질문 목록에 AI 모드 점검(source AI_MODE)이 보이지 않는다(진행 중·완료·배지 수 모두)
//  · 특보 줄에 유엔이가 센 「외 n건」이 없다 — 나머지 특보는 받은 이름 그대로 · 로, [모두 보기] = 발효 특보 전체(기상청 실응답 원문으로)
// npx vitest run harness/explore/queueWx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KMA from "../region/kma_t6_samples.json";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import type { JobSummary } from "@/lib/jobTypes";
import type { BaseRegion } from "@/lib/baseRegion";
import { parseStatusText } from "@/lib/server/kma";
import { wxCovers } from "@/lib/wxMatch";
import { baseTarget } from "@/lib/baseRegion";
import { advLabel } from "@/lib/wxref";

const session = vi.hoisted(() => ({ s: {} as Record<string, unknown> }));
vi.mock("@/lib/session", () => ({ useSession: () => session.s, uid: (p: string) => `${p}x` }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }), usePathname: () => "/explore" }));

import QueuePanel from "@/components/queue/QueuePanel";
import { WxBar } from "@/components/AppShell";

afterEach(() => cleanup());

const now = new Date().toISOString();
const job = (id: string, source: JobSummary["source"], state: JobSummary["state"], q: string): JobSummary => ({
  id, account_id: "admin01", conv_id: null, turn_no: 1, source, library_id: null, question_user: q, question_sent: q, state,
  t3q_status: state === "DONE" ? "SUCCESS" : null, http_status: null, cached_from: null, retry_of: null, error_code: null,
  created_at: now, submitted_at: now, finished_at: state === "DONE" ? now : null, elapsed_ms: state === "DONE" ? 9000 : null, t3q_conversation_id: null,
});

describe("질문 목록 — AI 모드 점검 빼기(R39)", () => {
  const jobs = [
    job("u1", "USER", "RUNNING", "부산 침수 위험지구는?"),
    job("a1", "AI_MODE", "RUNNING", "제공된 기상특보 정보를 기준으로 점검 중"),
    job("u2", "USER", "DONE", "인제 산사태 이력은?"),
    job("a2", "AI_MODE", "DONE", "제공된 기상특보 정보를 기준으로 점검 끝"),
  ];
  const set = () => {
    session.s = { jobOrder: jobs.map((j) => j.id), jobs: Object.fromEntries(jobs.map((j) => [j.id, j])), t3qOk: true };
  };

  it("펼친 목록 — 진행 중·완료 어디에도 점검이 없고, 진행 수도 점검을 세지 않는다", () => {
    set();
    const { container } = render(<QueuePanel open setOpen={() => {}} onPick={() => {}} currentJobIds={new Set()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("부산 침수 위험지구는?");
    expect(text).toContain("인제 산사태 이력은?");
    expect(text).not.toContain("기상특보 정보를 기준으로");
    expect(container.querySelectorAll(".qp-item")).toHaveLength(2);
    expect(text).toContain("진행 1");
  });

  it("접힌 탭 — 배지 수에 점검이 들지 않는다", () => {
    set();
    const { container } = render(<QueuePanel open={false} setOpen={() => {}} onPick={() => {}} currentJobIds={new Set()} />);
    expect([...container.querySelectorAll(".qp-badge")].map((b) => b.textContent)).toEqual(["1", "1"]);
  });

  it("점검만 있으면 빈 목록", () => {
    session.s = { jobOrder: ["a1", "a2"], jobs: { a1: jobs[1], a2: jobs[3] }, t3qOk: true };
    const { container } = render(<QueuePanel open={false} setOpen={() => {}} onPick={() => {}} currentJobIds={new Set()} />);
    expect(container.querySelectorAll(".qp-badge")).toHaveLength(0);
  });
});

describe("특보 줄 — 「외 n건」 없이 받은 이름 그대로(R40)", () => {
  const S = Object.fromEntries(KMA.samples.map((s) => [s.key, s])) as unknown as Record<string, { tmFc: number; t6: string }>;
  const t = (v: number) => {
    const s = String(v);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
  };
  const gale = parseStatusText(S.gale.t6, t(S.gale.tmFc)) as Advisory[];
  const weather: WeatherResponse = { mode: "live", status: { ok: true, fetchedAt: now, message: "기상청 06:00 발표" }, advisories: gale, preliminary: [] };
  const show = (base: BaseRegion | null) => {
    session.s = { weather, account: { id: "admin01" }, cond: { base }, wxRef: null, setWxRef: () => {}, aimOn: false };
    return render(<WxBar />).container;
  };
  const mine = (base: BaseRegion | null) => gale.filter((a) => a.status !== "해제" && a.status !== "변경" && wxCovers(a.area, baseTarget(base)));

  it("전국(특보 여럿) — 「외 」·「n건」 없이 나머지 특보 이름을 · 로 잇는다", () => {
    expect(mine(null).length).toBeGreaterThan(2);
    const c = show(null);
    const bar = c.querySelector(".wxbar")!;
    expect(bar.textContent).not.toContain("외 ");
    expect(bar.textContent).not.toMatch(/\d+\s*건/);
    const more = bar.querySelector(".more")!;
    const top = [...mine(null)].sort((a, b) => (b.level === "경보" ? 1 : 0) - (a.level === "경보" ? 1 : 0))[0];
    // 구역 + 특보 이름(구역이 다른 같은 특보가 같은 글자로 겹쳐 보이지 않게)
    expect(more.textContent).toBe(`· ${mine(null).filter((a) => a !== top).map((a) => `${a.area} ${advLabel(a)}`).join(" · ")}`);
  });

  it("[모두 보기] — 발효 특보 전체를 받은 구역·이름 그대로, 개수 숫자 없이", () => {
    const c = show(null);
    fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
    const list = screen.getByRole("list", { name: "발효 중인 특보" });
    const rows = list.querySelectorAll("[role=listitem]");
    expect(rows).toHaveLength(mine(null).length);
    // 받은 순서 그대로(유엔이가 다시 늘어세우지 않음)
    expect([...rows].map((r) => r.querySelector(".ar")!.textContent)).toEqual(mine(null).map((a) => a.area));
    expect([...rows].map((r) => r.querySelector(".lvb")!.textContent)).toEqual(mine(null).map(advLabel));
    expect(list.querySelector(".hd")!.textContent).toBe("발효 중인 특보");
    expect(c.querySelector(".wxbar")!.textContent).not.toMatch(/\d+\s*건/);
  });

  it("기준지역(제주특별자치도)이면 그 지역을 덮는 특보만", () => {
    const base: BaseRegion = { sido: { code: "50", name: "제주특별자치도" } };
    const m = mine(base);
    expect(m.length).toBeGreaterThan(0);
    const c = show(base);
    expect(c.querySelector(".wxbar")!.textContent).not.toContain("외 ");
    if (m.length > 1) {
      fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
      expect(screen.getByRole("list", { name: "발효 중인 특보" }).querySelectorAll("[role=listitem]")).toHaveLength(m.length);
    } else expect(c.querySelector(".more")).toBeNull();
  });

  describe("[모두 보기] 닫기", () => {
    const list = () => screen.queryByRole("list", { name: "발효 중인 특보" });
    const at = (w: WeatherResponse, base: BaseRegion | null = null) => {
      session.s = { weather: w, account: { id: "admin01" }, cond: { base }, wxRef: null, setWxRef: () => {}, aimOn: false };
    };
    const openAll = () => {
      at(weather);
      const r = render(<WxBar />);
      fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
      expect(list()).not.toBeNull();
      return r;
    };

    it("Esc · 바깥 누르기로 닫힌다(목록 안을 누르면 그대로)", () => {
      openAll();
      fireEvent.mouseDown(list()!);
      expect(list()).not.toBeNull();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(list()).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "모두 보기" }));
      fireEvent.mouseDown(document.body);
      expect(list()).toBeNull();
    });

    it("기준지역이 바뀌면 닫힌다", () => {
      const r = openAll();
      at(weather, { sido: { code: "50", name: "제주특별자치도" } });
      r.rerender(<WxBar />);
      expect(list()).toBeNull();
    });

    it("특보가 1건·0건·조회 실패가 되었다가 다시 여럿이 되어도 저절로 펼쳐지지 않는다", () => {
      for (const w of [
        { ...weather, advisories: gale.slice(0, 1) },
        { ...weather, advisories: [] },
        { ...weather, status: { ok: false, fetchedAt: now, message: "기상청 응답 없음" }, advisories: [] },
      ] as WeatherResponse[]) {
        const r = openAll();
        at(w);
        r.rerender(<WxBar />);
        expect(list()).toBeNull();
        at(weather);
        r.rerender(<WxBar />);
        expect(screen.getByRole("button", { name: "모두 보기" })).toBeTruthy();
        expect(list()).toBeNull();
        cleanup();
      }
    });
  });
});
