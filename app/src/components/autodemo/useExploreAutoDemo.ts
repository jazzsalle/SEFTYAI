"use client";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { baseKey } from "@/lib/baseRegion";
import { DAY_ITEMS, demoAsk, type DemoItem } from "@/lib/library";
import { aimDemoAdvisory, aimDemoById } from "@/lib/autoDemoAim";
import { AUTODEMO_START_EVENT, autoDemoBus } from "@/lib/autoDemoBus";
import { DemoRegions, type DemoPin } from "./autoScript";
import { useAutoDemo } from "./useAutoDemo";
import { loadAimPins } from "./AimPrep";

type Ask = (a: ReturnType<typeof demoAsk> & { pinId: string }) => Promise<unknown>;

/**
 * 통합 탐색의 자동 시연(R54) — 개발서버 SearchPage 의 useAutoDemo 동작(actions)을 우리 화면에 잇는다.
 *  · 질문 = 질문 모음 「한눈 요약 질의」(lib/library DAY_ITEMS) 의 받아 둔 답(sa_demo_pins). 받아 둔 답이 없으면 그 장면을 건너뛴다(에이전트를 부르지 않음 — 개발서버와 같음)
 *  · AI 모드 장면 = 가상 특보로 받아 둔 점검(/api/autodemo/aim) → 특보 줄·AI 모드 창(lib/autoDemoBus)
 *  · 기준지역 = 장면의 지역(부산·인제) — 바꾸면 새 대화(개발서버 applyRegion)
 */
export function useExploreAutoDemo(p: {
  newConv: () => void;
  ask: Ask;
  layout: () => void;
  open: (what: "map" | "summary") => void;
}) {
  const s = useSession();
  const sRef = useRef(s);
  sRef.current = s;
  const pRef = useRef(p);
  pRef.current = p;

  const demo = useAutoDemo({
    list: async () => {
      const [pins, aims] = await Promise.all([
        api<{ pins: Record<string, { at: string | null }> }>("/api/demo-pins").then((r) => r.pins).catch(() => ({}) as Record<string, { at: string | null }>),
        loadAimPins().catch(() => []),
      ]);
      const out: DemoPin[] = DAY_ITEMS.map((d) => ({ pin_id: d.id, question: d.text, received_at: pins[d.id]?.at ?? null }));
      for (const a of aims) out.push({ pin_id: a.id, question: a.title, received_at: a.view ? a.at : null });
      return out;
    },
    reset: () => pRef.current.newConv(),
    region: (r) => {
      const next = DemoRegions[r];
      if (baseKey(sRef.current.cond.base) === baseKey(next)) return;
      // 가상 특보는 그 지역(부산) 것이다 — 다른 지역으로 넘어가면 걷어 실제 특보 상태를 보인다(개발서버 사용자 지시 2026-11-05)
      autoDemoBus.clear();
      if (!sRef.current.setBase(next)) return sRef.current.toast("질의·응답이 진행 중이라 기준지역을 바꾸지 못했습니다.");
      pRef.current.newConv();
    },
    play: async (pin) => {
      const d: DemoItem | undefined = DAY_ITEMS.find((x) => x.id === pin.pin_id);
      if (!d || !pin.received_at) return false;
      // 받아 둔 답(사본)을 대화에 놓는다 — 질문 모음 「한눈 요약 질의」와 같은 길(pinId)
      return pRef.current.ask({ ...demoAsk(d), pinId: d.id }).then(() => true, () => false);
    },
    aiMode: async (pinId) => {
      const it = aimDemoById(pinId);
      const row = it ? (await loadAimPins().catch(() => [])).find((x) => x.id === pinId) : undefined;
      if (!it || !row?.view) return false;
      autoDemoBus.set({ aim: row.view, aimOpen: true, warnings: [aimDemoAdvisory(it)] });
      return true;
    },
    closeAiMode: () => autoDemoBus.set({ aimOpen: false }),
    cleanup: () => autoDemoBus.clear(),
    layout: () => pRef.current.layout(),
    open: (what) => pRef.current.open(what),
  });

  // 머리 메뉴 [자동 시연] · 다른 화면에서 옮겨 온 /explore?autodemo=1
  const startRef = useRef(demo.start);
  startRef.current = demo.start;
  const idle = demo.phase === "idle" || demo.phase === "done";
  const idleRef = useRef(idle);
  idleRef.current = idle;
  useEffect(() => {
    const on = () => {
      if (idleRef.current) void startRef.current();
    };
    window.addEventListener(AUTODEMO_START_EVENT, on);
    return () => window.removeEventListener(AUTODEMO_START_EVENT, on);
  }, []);
  const ready = !!s.account;
  useEffect(() => {
    if (!ready) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("autodemo") !== "1") return;
    u.searchParams.delete("autodemo");
    window.history.replaceState(null, "", u.pathname + u.search);
    void startRef.current();
  }, [ready]);

  // 도는 동안 머리 메뉴 [자동 시연]을 막는다. 화면을 떠나면 가상 특보·AI 모드 창도 걷는다
  const running = demo.phase === "loading" || demo.phase === "playing" || demo.phase === "paused";
  useEffect(() => autoDemoBus.set({ running }), [running]);
  useEffect(() => () => autoDemoBus.set({ running: false, aim: null, aimOpen: false, warnings: null }), []);

  return demo;
}
