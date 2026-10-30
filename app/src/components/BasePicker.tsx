"use client";
/**
 * 머리줄 기준지역 고르기(R32) — 전국 → 시·도 → 시·군·구 → 읍·면·동. 지자체·중앙 모두 바꿀 수 있다.
 *  · 선택지는 /api/regions(브이월드 행정구역 이름·코드)에서만 — 부모 코드별로 한 번 받아 이 탭 메모리에 둔다. 받는 중·받지 못하면
 *    「전국」(지금 고른 값이 있으면 그 값)만 두고, 받지 못하면 짧은 안내와 다시 불러오기를 보인다(지어낸 보기 없음)
 *  · 질의·응답이 진행 중이면(보내는 중·대기·답변 생성 중) 바꿀 수 없다 — AI 모드 점검은 빼고(R44). 바꾸면 AI 모드는 꺼지고 진행 중인 점검은 취소된다(R47 — 세션 setBase)
 *  · 바꿀 때마다 「기준지역 변경」 확인 창(R47 — 대화가 비어도 · 다른 화면에서도): AI 모드를 켜 두었으면 「1. … AI 모드가 종료됩니다 … 2. 새 대화로 시작합니다 …」, 아니면 새 대화 한 줄.
 *    [새 대화로 시작] = 기준지역 바꿈 → 통합 탐색 새 대화(sa:new-conv · 다른 화면이면 /explore)
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { AreaPick, BaseRegion } from "@/lib/baseRegion";
import { Dialog } from "./account/Dialog";

type Level = "sido" | "sigungu" | "emd";
export const BASE_BUSY = "질의·응답이 진행 중이라 기준지역을 바꿀 수 없습니다";

const cache = new Map<string, AreaPick[]>();
const loading = new Map<string, Promise<AreaPick[]>>();
function loadAreas(level: Level, parent: string): Promise<AreaPick[]> {
  const k = `${level}|${parent}`;
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(k);
  if (!p) {
    p = api<{ items?: AreaPick[] }>(`/api/regions?level=${level}${parent ? `&parent=${parent}` : ""}`)
      .then((r) => {
        const items = (r.items ?? []).filter((x) => typeof x?.code === "string" && typeof x?.name === "string");
        cache.set(k, items);
        return items;
      })
      .finally(() => loading.delete(k));
    loading.set(k, p);
  }
  return p;
}

/** 한 단계의 선택지 — parent 가 null 이면 고를 수 없는 단계 */
function useAreas(level: Level, parent: string | null) {
  const k = parent === null ? null : `${level}|${parent}`;
  const [, setLoaded] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (k === null || parent === null || cache.has(k)) return;
    let alive = true;
    setFailed((f) => (f === k ? null : f));
    loadAreas(level, parent)
      .then(() => alive && setLoaded((n) => n + 1))
      .catch(() => alive && setFailed(k));
    return () => {
      alive = false;
    };
  }, [k, level, parent, tick]);
  return { items: k ? cache.get(k) ?? null : null, failed: k !== null && failed === k, retry: () => setTick((t) => t + 1) };
}

/** 받은 목록 + (목록에 없으면) 지금 고른 값 하나 */
const withCurrent = (items: AreaPick[] | null, cur?: AreaPick | null) => {
  const l = items ?? [];
  return cur && !l.some((x) => x.code === cur.code) ? [cur, ...l] : l;
};

export default function BasePicker() {
  const s = useSession();
  const base = s.cond.base;
  const sido = useAreas("sido", "");
  const sgg = useAreas("sigungu", base ? base.sido.code : null);
  const emd = useAreas("emd", base?.sigungu ? base.sigungu.code : null);
  const [pending, setPending] = useState<{ base: BaseRegion | null; aim: boolean } | null>(null);
  const path = usePathname();
  const router = useRouter();
  const busy = s.asking;
  const title = busy ? BASE_BUSY : undefined;

  const sidoOpts = withCurrent(sido.items, base?.sido);
  const sggOpts = withCurrent(sgg.items, base?.sigungu);
  const emdOpts = withCurrent(emd.items, base?.emd);
  const failed = sido.failed || sgg.failed || emd.failed;

  // R47 — 바꿀 때마다 확인 창(대화가 비어도 · 다른 화면에서도). 확인하면 새 대화로 시작하고, AI 모드를 켜 두었으면 끈다(세션 setBase)
  const request = (next: BaseRegion | null) => {
    if (s.asking) return s.toast(BASE_BUSY);
    setPending({ base: next, aim: s.aimOn });
  };
  const confirm = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (!s.setBase(p.base)) return s.toast(BASE_BUSY);
    // 통합 탐색 화면의 「새 대화」와 같게 — 빈 대화(시작 화면)로. 다른 화면이면 통합 탐색으로(처음 열면 빈 대화)
    if (path?.startsWith("/explore")) window.dispatchEvent(new CustomEvent("sa:new-conv"));
    else router.push("/explore");
  };
  const retry = () => {
    if (sido.failed) sido.retry();
    if (sgg.failed) sgg.retry();
    if (emd.failed) emd.retry();
  };

  return (
    <div className="scope" title={title}>
      <span className="xs muted">기준지역</span>
      <select
        className="select sm"
        value={base?.sido.code ?? ""}
        disabled={busy}
        title={title}
        aria-label="기준지역 시·도"
        onChange={(e) => {
          const o = sidoOpts.find((x) => x.code === e.target.value);
          request(o ? { sido: o } : null);
        }}
      >
        <option value="">전국</option>
        {sidoOpts.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
      </select>
      {base && (
        <select
          className="select sm"
          value={base.sigungu?.code ?? ""}
          disabled={busy}
          title={title}
          aria-label="기준지역 시·군·구"
          onChange={(e) => {
            const o = sggOpts.find((x) => x.code === e.target.value);
            request(o ? { sido: base.sido, sigungu: o } : { sido: base.sido });
          }}
        >
          <option value="">시·군·구 전체</option>
          {sggOpts.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
        </select>
      )}
      {base?.sigungu && (
        <select
          className="select sm"
          value={base.emd?.code ?? ""}
          disabled={busy}
          title={title}
          aria-label="기준지역 읍·면·동"
          onChange={(e) => {
            const o = emdOpts.find((x) => x.code === e.target.value);
            request(o ? { sido: base.sido, sigungu: base.sigungu, emd: o } : { sido: base.sido, sigungu: base.sigungu });
          }}
        >
          <option value="">읍·면·동 전체</option>
          {emdOpts.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
        </select>
      )}
      {failed && (
        <span className="scope-err xs" role="status">
          지역 목록을 불러오지 못했습니다
          <button type="button" className="lnk xs" onClick={retry}>다시 불러오기</button>
        </span>
      )}
      {pending && (
        <Dialog
          role="alertdialog"
          size="sm"
          title="기준지역 변경"
          // R47 — 대화 중 기준지역 변경 안내와 AI 모드 종료 안내를 한 창으로. AI 모드 줄은 켜 두었을 때만
          desc={
            pending.aim ? (
              <>
                <div>1. 기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오.</div>
                <div>2. 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다.</div>
              </>
            ) : (
              "기준지역을 바꾸면 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다."
            )
          }
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="acm-btn" onClick={() => setPending(null)}>취소</button>
              <button type="button" className="acm-btn pri" onClick={confirm}>새 대화로 시작</button>
            </>
          }
        />
      )}
    </div>
  );
}
