"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { RefLike } from "@/lib/mapRef";
import { keyRefs, loadSummary, sigunguOf, type AnswerSummary } from "@/lib/summary";

export type SummaryState = { kind: "none" } | { kind: "loading" } | { kind: "ok"; summary: AnswerSummary };

/** 답 하나의 한눈 요약(개발 서버 useSummary) — 같은 refs 면 받아 둔 것을 쓴다 */
export function useSummary(refs: RefLike[] | undefined | null): SummaryState {
  // 묶을 객체 ID 가 없으면 「만드는 중」을 잠깐도 띄우지 않는다
  const key = useMemo(() => keyRefs(refs ?? []).map((k) => k.id).join(","), [refs]);
  const [state, setState] = useState<SummaryState>(key ? { kind: "loading" } : { kind: "none" });
  useEffect(() => {
    if (!refs?.length || !key) {
      setState({ kind: "none" });
      return;
    }
    let alive = true;
    setState({ kind: "loading" });
    loadSummary(refs)
      .then((summary) => alive && setState(summary ? { kind: "ok", summary } : { kind: "none" }))
      .catch(() => alive && setState({ kind: "none" }));
    return () => {
      alive = false;
    };
    // refs 배열은 그릴 때마다 새로 올 수 있다 — 대상 묶음이 같으면 같은 답이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

const names = new Map<string, string>();
const asked = new Set<string>();

/** 시군구 코드(5자리) → 이름. 「연제구 2 · 동래구 1」 처럼 적을 때. 시·도마다 한 단계 아래 목록을 한 번 받아 둔다 */
export function useDistrictNames(summary: AnswerSummary | null): ReadonlyMap<string, string> {
  const [n, bump] = useState(0);
  const sidos = useMemo(() => {
    const set = new Set<string>();
    for (const g of summary?.groups ?? []) for (const r of g.rows) {
      const sig = sigunguOf(r.adminCode);
      if (sig && !names.has(sig)) set.add(sig.slice(0, 2));
    }
    return [...set].sort().join(",");
  }, [summary]);
  useEffect(() => {
    const todo = sidos ? sidos.split(",").filter((s) => !asked.has(s)) : [];
    let alive = true;
    for (const sido of todo) {
      asked.add(sido);
      api<{ items: { code: string; name: string }[] }>(`/api/regions?level=sigungu&parent=${sido}`)
        .then((r) => {
          for (const it of r.items) names.set(it.code, it.name);
          if (alive) bump((x) => x + 1);
        })
        .catch(() => asked.delete(sido));
    }
    return () => {
      alive = false;
    };
  }, [sidos]);
  return useMemo(() => new Map(names), [n]);
}
