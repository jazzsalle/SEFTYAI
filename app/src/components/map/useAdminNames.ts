"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { adminCenterCode, adminLookupOf } from "@/lib/mapRef";

/**
 * 행정구역 중심점으로 온 대상의 지역 이름(개발 서버 useAdminNames) — /api/regions 로 한 단계 위를 물어 그 안에서 찾는다.
 * 받은 것은 이 창이 사는 동안 들고 있는다(행정구역 이름은 보는 사이에 바뀌지 않는다). 못 받으면 받은 이름을 그대로 쓴다.
 */
const names = new Map<string, string>();
const asked = new Set<string>();

export function useAdminNames(items: { precision: string | null; mapValue?: string | null }[]): ReadonlyMap<string, string> {
  const [n, bump] = useState(0);
  const todo = [
    ...new Set(
      items
        .map((f) => adminCenterCode(f.precision, f.mapValue))
        .filter((c): c is string => !!c && !names.has(c))
        .map((c) => {
          const q = adminLookupOf(c);
          return `${q.level}|${q.parent}`;
        }),
    ),
  ].sort();
  const key = todo.join(",");
  useEffect(() => {
    const list = key ? key.split(",").filter((k) => !asked.has(k)) : [];
    let alive = true;
    for (const k of list) {
      asked.add(k);
      const [level, parent] = k.split("|");
      api<{ items: { code: string; name: string }[] }>(`/api/regions?level=${level}&parent=${parent}`)
        .then((r) => {
          for (const it of r.items) names.set(it.code, it.name);
          if (alive) bump((x) => x + 1);
        })
        .catch(() => asked.delete(k)); // 다음에 다시 물을 수 있게
    }
    return () => {
      alive = false;
    };
  }, [key]);
  // 새 이름이 오면 다른 Map 으로 — 받는 쪽(지도 이름표)이 바뀐 줄 알게
  return useMemo(() => new Map(names), [n]);
}
