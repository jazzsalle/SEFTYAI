// @vitest-environment jsdom
// 사건 상세 패널(EventDetail = 개발서버 EventPane) — 녹화한 T3Q 응답으로 그려 본다.
// 순서 요약 → 근거(T3Q-19) → 피해·복구 → 사건 타임라인 → 유사도 근거(접힘) → 사건 개요, 머리 「사건 ID」·제목·칩(기간·재난유형·상태)·
// 「주관 … · 데이터 기준 …」 한 줄, 소제목 평글(.evp-h). 우리만 있던 표로 보기·기록 목록 보기·요인 표로 보기·원본 항목·⚠·히어로 아이콘은 없다.
// npx vitest run harness/explore
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventDetail from "@/components/explore/EventDetail";
import { won } from "@/components/summary/SimilarSummary";

type Req = { api: string; id?: string; body?: unknown };
const h = vi.hoisted(() => ({ env: new Map<string, { http: number; envelope: unknown }>(), calls: [] as { api: string; id?: string; body?: unknown }[] }));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  }
  return {
    ApiError,
    api: async (_path: string, init: { json?: Req } = {}) => {
      const req = init.json ?? { api: "" };
      h.calls.push(req);
      // 근거 조회(T3Q-19)는 ID 칸 없이 body.object_id 로 보낸다
      const hit = h.env.get(`${req.api}:${req.id ?? (req.body as { object_id?: string } | undefined)?.object_id ?? ""}`);
      if (!hit) throw new ApiError(502, "정보를 불러오지 못했습니다.", null);
      return { api: req.api, http: hit.http, ms: 1, envelope: hit.envelope };
    },
  };
});

const REC = join(__dirname, "..", "recordings");
type Rec = { id: string; http: number; body: unknown; response: Record<string, unknown> };
const data = JSON.parse(readFileSync(join(REC, "data_2026-10-27T15-53-38-514Z.json"), "utf8")) as Rec[];
const rec = (k: string) => {
  const r = data.find((x) => x.id === k);
  if (!r) throw new Error(`녹화 없음: ${k}`);
  return r;
};
const a10 = JSON.parse(readFileSync(join(REC, "a10_similar_details_2026-10-27T22-21-15-740Z.json"), "utf8")) as Record<string, { path: string; response: unknown }>;

const EV = "T10107-20200728-0001"; // 2020년 7.28.~8.11. 호우 — 네 조회 모두 녹화
const SAME = "T10107-20210825-0001"; // 시작 = 종료(2021-08-25)
const NONE = "T00000-00000000-0000"; // 없는 사건(NO_RESULT · 404)
h.env.set(`T3Q-10:${EV}`, { http: 200, envelope: rec("T3Q-10").response });
h.env.set(`T3Q-11:${EV}`, { http: 200, envelope: rec("T3Q-11").response });
h.env.set(`T3Q-12:${EV}`, { http: 200, envelope: rec("T3Q-12").response });
h.env.set(`T3Q-13:${EV}`, { http: 200, envelope: rec("T3Q-13").response });
h.env.set(`T3Q-19:${EV}`, { http: 200, envelope: rec("T3Q-19").response });
const same = Object.values(a10).find((x) => x.path === `/events/${SAME}`);
if (!same) throw new Error("A10 녹화에 시작=종료 사건이 없음");
h.env.set(`T3Q-10:${SAME}`, { http: 200, envelope: same.response });
h.env.set(`T3Q-10:${NONE}`, { http: 404, envelope: rec("NEG-unknown-event").response });
const ctx = (rec("T3Q-11").body as { query_context: Record<string, unknown> }).query_context;

type Tl = { total_count: number; items: (Record<string, unknown> & { category: string; occurred_at: string })[] };
const tl = rec("T3Q-12").response.result as Tl;
const rowsOf = (el: Element | null | undefined) => [...(el?.querySelectorAll("tbody tr") ?? [])].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
/** 글자로 단추 찾기(접힌 유사도 근거 안의 단추도) */
const btn = (c: Element, name: string) => {
  const b = [...c.querySelectorAll("button")].find((x) => x.textContent === name);
  if (!b) throw new Error(`단추 없음: ${name}`);
  return b;
};

afterEach(() => cleanup());

/** 다섯 조회가 모두 그려질 때까지 */
async function full() {
  const v = render(<EventDetail id={EV} label="목록에서 받은 이름" ctx={ctx} />);
  await screen.findByText("공공시설 시설유형별 피해액");
  await screen.findByText("요인군 기여");
  await waitFor(() => expect(v.container.querySelector(".evp-tl")).not.toBeNull());
  await waitFor(() => expect(v.container.querySelector(".evp-evd")).not.toBeNull());
  return v.container;
}
const secOf = (c: Element, name: string) => [...c.querySelectorAll(".evp-sec")].find((s) => s.querySelector("h3")?.textContent === name)!;

describe("사건 상세 패널 — 개발서버 EventPane 짜임", () => {
  it("섹션 순서 요약 → 근거 → 피해·복구 → 사건 타임라인 → 유사도 근거 → 사건 개요, 유사도 근거는 처음에 접힘 · 소제목은 평글(.evp-h)", async () => {
    const c = await full();
    expect([...c.querySelectorAll("h3")].map((x) => x.textContent)).toEqual(["요약", "근거", "피해·복구", "사건 타임라인", "유사도 근거", "사건 개요"]);
    expect([...c.querySelectorAll("h3")].every((x) => x.className === "evp-h")).toBe(true);
    const fold = c.querySelector("details.evp-fold");
    expect(fold?.querySelector("summary h3")?.textContent).toBe("유사도 근거");
    expect(fold?.hasAttribute("open")).toBe(false);
  });

  it("머리 — 「사건 ID …」 · 제목 · 칩(기간 · 재난유형 · 상태, 아이콘 없음) · 「주관 … · 데이터 기준 …」 한 줄", async () => {
    const c = await full();
    const ev = rec("T3Q-10").response as { result: { display_name: string; disaster_types: string[]; lead_agency: string; time_profile: { started_at: string; ended_at: string } }; meta: { base_time: string } };
    expect(c.querySelector(".evp-id")?.textContent).toBe(`사건 ID ${EV}`);
    expect(c.querySelector(".evp-title")?.textContent).toBe(ev.result.display_name);
    const chips = [...c.querySelectorAll(".evp-chip")].map((x) => x.textContent);
    expect(chips[0]).toBe(`${ev.result.time_profile.started_at} ~ ${ev.result.time_profile.ended_at}`);
    expect(chips.slice(1, 1 + ev.result.disaster_types.length)).toEqual(ev.result.disaster_types);
    expect(c.querySelector(".evp-chips svg")).toBeNull();
    expect(c.querySelector(".evp-sub")?.textContent).toBe(`주관 ${ev.result.lead_agency} · 데이터 기준 ${ev.meta.base_time.replace("T", " ").slice(0, 16)}`);
    expect(c.querySelector(".evd-hero, .evd-hero-ic")).toBeNull();
  });

  it("피해·복구 — 값 칸(재산피해·공공시설·사유시설·인명 받은 키마다) · 시설유형 막대(이름 옆 건수) · 보고 단계 표(억·만 원)", async () => {
    const c = await full();
    type Rcv = { report_level: string; item_count: number; damage_amount_krw: number; recovery_cost_krw: number };
    const dmg = (rec("T3Q-13").response.result as { damage: { property: { property_damage_krw: number }; facilities: { recovery: Rcv[] } } }).damage;
    const sec = secOf(c, "피해·복구");
    const labels = [...sec.querySelectorAll(".sm-value-label")].map((x) => x.textContent);
    expect(labels[0]).toBe("재산피해");
    expect(sec.querySelector(".sm-value-num")?.textContent).toBe(won(dmg.property.property_damage_krw));
    expect(labels.some((x) => x?.startsWith("공공시설 · "))).toBe(true);
    expect(labels).toContain("이재민");
    const bars = [...sec.querySelectorAll(".sm-bar-label")].map((x) => x.textContent);
    expect(bars[0]).toBe("하수도 · 69건");
    expect(rowsOf(sec.querySelector(".evp-table"))).toEqual(dmg.facilities.recovery.map((x) => [x.report_level, String(x.item_count), won(x.damage_amount_krw), won(x.recovery_cost_krw)]));
    expect(sec.textContent).not.toContain("인명·이재민");
  });

  it("사건 타임라인 — 분류별 개수 칩 · 받은 순서 세로 목록(12건까지, 「외 N건 더 보기」) · 전체 건수 안내", async () => {
    const c = await full();
    const sec = secOf(c, "사건 타임라인");
    expect(sec.querySelectorAll(".sm-count").length).toBe(new Set(tl.items.map((i) => i.category)).size);
    expect(sec.textContent).toContain(`전체 ${tl.total_count}건 중 ${tl.items.length}건을 받았습니다.`);
    expect(sec.querySelectorAll(".evp-tl > li").length).toBe(Math.min(12, tl.items.length));
    expect(sec.querySelector(".evp-tl-at")?.textContent).toBe(tl.items[0].occurred_at.replace("T", " ").slice(0, 16));
    if (tl.items.length > 12) {
      fireEvent.click(btn(sec, `외 ${tl.items.length - 12}건 더 보기`));
      expect(sec.querySelectorAll(".evp-tl > li").length).toBe(tl.items.length);
    }
  });

  it("유사도 근거 — 요인군 기여 막대 + 요인 표(요인 · 현재 조건 · 과거 사례 · 일치도 · 기여도)", async () => {
    const c = await full();
    const fold = c.querySelector("details.evp-fold")!;
    expect(fold.querySelector(".sm-mod-title")?.textContent).toBe("요인군 기여");
    expect([...fold.querySelectorAll("thead th")].map((x) => x.textContent)).toEqual(["요인", "현재 조건", "과거 사례", "일치도", "기여도"]);
    expect(rowsOf(fold)[0]).toEqual(["재난유형 · 재난유형", "T10107 호우", "T10107 호우", "1", "46.6667"]);
  });

  it("우리만 있던 것은 없다 — 표로 보기 · 기록 목록 보기 · 요인 표로 보기 · 원본 항목 · ⚠ 관련 시도 더 있음 · 막대 제목", async () => {
    const text = (await full()).textContent ?? "";
    for (const s of ["표로 보기", "기록 목록 보기", "요인 표로 보기", "원본 항목", "⚠", "관련 시도 더 있음", "보고 단계별 피해액·복구비", "특보·재난문자 기록", "인명·이재민"]) {
      expect(text, s).not.toContain(s);
    }
  });
});

describe("사건 상세 패널 — 비어 있음·실패", () => {
  it("없는 사건 — 「사건 상세를 불러오지 못했습니다.」", async () => {
    render(<EventDetail id={NONE} label="없는 사건" ctx={null} />);
    expect(await screen.findByText("사건 상세를 불러오지 못했습니다.")).toBeTruthy();
  });

  it("비교 조건이 없으면 유사도 근거를 조회하지 않는다 — 「해당 정보가 제공되지 않습니다.」", async () => {
    h.calls.length = 0;
    const { container } = render(<EventDetail id={SAME} label="" ctx={null} />);
    await screen.findByText(/^2021-08-25 ~ 2021-08-25$/);
    expect(h.calls.some((x) => x.api === "T3Q-11")).toBe(false);
    expect(container.querySelector("details.evp-fold")!.textContent).toBe("유사도 근거해당 정보가 제공되지 않습니다.");
  });

  it("제공처가 주지 않는 섹션(타임라인 없음)은 「해당 정보가 제공되지 않습니다.」, 받은 사실은 제공 항목 줄에", async () => {
    const { container } = render(<EventDetail id={SAME} label="" ctx={null} />);
    await screen.findByText(/^2021-08-25 ~ 2021-08-25$/);
    expect(secOf(container, "사건 타임라인").textContent).toBe("사건 타임라인해당 정보가 제공되지 않습니다.");
    expect(container.textContent).toContain("타임라인 없음");
  });
});

describe("사건 상세 패널 — 근거(T3Q-19)", () => {
  type EvdEnv = { result: { items: { title: string | null; page: string | null; section_path: string | null }[] } };
  const evd = rec("T3Q-19").response as unknown as EvdEnv;

  it("사건 ID 로 조회한다(실측과 같은 요청 모양 — 호출자 칸은 서버 쪽)", async () => {
    h.calls.length = 0;
    render(<EventDetail id={SAME} label="" ctx={null} />);
    await waitFor(() => expect(h.calls.some((x) => x.api === "T3Q-19")).toBe(true));
    const call = h.calls.find((x) => x.api === "T3Q-19");
    expect(call?.id).toBeUndefined();
    const shape = { ...(rec("T3Q-19").body as Record<string, unknown>) };
    delete shape.caller;
    expect(call?.body).toEqual({ ...shape, object_id: SAME });
  });

  it("받은 항목마다 한 줄 — 「제목 쪽」 굵게 · 장 경로", async () => {
    const sec = secOf(await full(), "근거");
    const lines = [...sec.querySelectorAll("ul.evp-evd > li")].map((li) => li.textContent);
    expect(lines).toEqual(evd.result.items.map((it) => [it.title, it.page].filter(Boolean).join(" ") + (it.section_path ? ` · ${it.section_path}` : "")));
  });

  it("받지 못하면 「불러오지 못했습니다.」", async () => {
    const { container } = render(<EventDetail id={SAME} label="" ctx={null} />);
    await waitFor(() => expect(secOf(container, "근거")?.textContent).toBe("근거불러오지 못했습니다."));
  });
});
