"use client";
/**
 * 머리줄 기준지역 고르기(R32) — 전국 → 시·도 → 시·군·구 → 읍·면·동. 지자체·중앙 모두 바꿀 수 있다.
 *  · 선택지는 /api/regions(브이월드 행정구역 이름·코드)에서만 — 부모 코드별로 한 번 받아 이 탭 메모리에 둔다. 받는 중·받지 못하면
 *    「전국」(지금 고른 값이 있으면 그 값)만 두고, 받지 못하면 짧은 안내와 다시 불러오기를 보인다(지어낸 보기 없음)
 *  · 답변 중에도 바꿀 수 있다(개발서버 352a97c FUN-UFR-101002 — R62, 전 R60 ⑦ 잠금 없앰). 바꾸면 AI 모드는 꺼진다(R47 — 세션 setBase)
 *  · 같은 시·도 안에서만 바꾸면(AI 모드 꺼짐) 묻지 않고 바꾸고 대화를 유지한다 — 통합 탐색이 그 자리에 구분선(REGION_BREAK_EVENT)
 *  · 시·도가 바뀌면 「기준지역 변경」 확인 창(R47 — 대화가 비어도 · 다른 화면에서도): AI 모드를 켜 두었으면 「1. … AI 모드가 종료됩니다 … 2. 새 대화로 시작합니다 …」, 아니면 새 대화 한 줄.
 *    지금 대화에 답변 생성 중·대기 중인 질문이 있으면 그 처리를 한 줄 더(중지 안내창 · FUN-UFR-306004 leaveMessage).
 *    [새 대화로 시작] = 그 질문을 멈추고 기준지역 바꿈 → 통합 탐색 새 대화(sa:new-conv · 다른 화면이면 /explore)
 *  · AI 모드를 켠 채 같은 시·도 안에서 바꾸면 AI 모드 종료 한 줄만 묻고 [기준지역 변경] — 대화는 유지
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { baseKey, baseName, type AreaPick, type BaseRegion } from "@/lib/baseRegion";
import { activityOf, isSameProvince, leaveMessage, openConvBus, REGION_BREAK_EVENT, useOpenConv } from "@/lib/dialogue";
import { Dialog } from "./account/Dialog";

type Level = "sido" | "sigungu" | "emd";
/** 개발서버 RegionPicker BusyText(R60) — 개발서버도 이제 잠그지 않아(352a97c) 쓰지 않는다. 글자만 남겨 둔다 */
export const BASE_BUSY = "답을 기다리는 중에는 기준지역을 바꿀 수 없습니다";

const cache = new Map<string, AreaPick[]>();
const loading = new Map<string, Promise<AreaPick[]>>();
export function loadAreas(level: Level, parent: string): Promise<AreaPick[]> {
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
  const [pending, setPending] = useState<{ base: BaseRegion | null; aim: boolean; same: boolean } | null>(null);
  const path = usePathname();
  const router = useRouter();
  // 지금(또는 마지막으로) 통합 탐색에서 본 대화의 진행 상황 — 중지 안내창 문구(FUN-UFR-306004)
  const openConv = useOpenConv();
  const act = activityOf(openConv.turns, (id) => s.jobs[id]?.state);

  const sidoOpts = withCurrent(sido.items, base?.sido);
  const sggOpts = withCurrent(sgg.items, base?.sigungu);
  const emdOpts = withCurrent(emd.items, base?.emd);
  const failed = sido.failed || sgg.failed || emd.failed;

  /** 같은 시·도 안의 변경 — 대화는 그대로 두고 통합 탐색이 바뀐 자리에 구분선을 남긴다(개발서버 applySameProvince) */
  const applySame = (next: BaseRegion | null) => {
    const from = baseName(base);
    s.setBase(next);
    window.dispatchEvent(new CustomEvent(REGION_BREAK_EVENT, { detail: { from, to: baseName(next) } }));
  };
  // R47 — 시·도가 바뀌면 확인 창(대화가 비어도 · 다른 화면에서도). 같은 시·도 안이면 AI 모드가 켜져 있을 때만 묻는다(개발서버 requestRegionChange)
  const request = (next: BaseRegion | null) => {
    if (baseKey(next) === baseKey(base)) return;
    const same = isSameProvince(base, next);
    if (same && !s.aimOn) return applySame(next);
    setPending({ base: next, aim: s.aimOn, same });
  };
  const confirm = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.same) return applySame(p.base);
    // 답변 생성 중인 질문은 상류에서도 멈추게 한다(중단), 대기 중·보내는 중인 질문은 보내지 않는다(개발서버 confirmRegionChange)
    const cur = openConvBus.get();
    openConvBus.markLeft(cur.convId);
    for (const id of activityOf(cur.turns, (j) => s.jobs[j]?.state).jobIds) void s.cancel(id).catch(() => {});
    s.setBase(p.base);
    // 통합 탐색 화면의 「새 대화」와 같게 — 빈 대화(시작 화면)로. 다른 화면이면 통합 탐색으로(처음 열면 빈 대화)
    if (path?.startsWith("/explore")) window.dispatchEvent(new CustomEvent("sa:new-conv"));
    else router.push("/explore");
  };
  // 중지 안내 한 줄 — 같은 시·도 안의 변경은 질문을 멈추지 않으므로 붙이지 않는다(개발서버 1390a0f)
  const stopLine = pending && !pending.same ? leaveMessage(act.running, act.waiting) : "";
  const retry = () => {
    if (sido.failed) sido.retry();
    if (sgg.failed) sgg.retry();
    if (emd.failed) emd.retry();
  };

  return (
    <div className="scope">
      <span className="xs muted">기준지역</span>
      <select
        className="select sm"
        value={base?.sido.code ?? ""}
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
          // 같은 시·도 안(AI 모드 켬)이면 AI 모드 종료 한 줄만 — 대화는 유지한다(개발서버 352a97c). 중지 안내(stopLine)는 시·도가 바뀔 때만
          desc={
            pending.aim && pending.same ? (
              "기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오."
            ) : pending.aim ? (
              <>
                <div>1. 기준지역을 바꾸면 AI 모드가 종료됩니다. 다시 실행하여 주십시오.</div>
                <div>2. 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다.</div>
                {stopLine && <div>3. {stopLine}</div>}
              </>
            ) : stopLine ? (
              <>
                <div>기준지역을 바꾸면 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다.</div>
                <div>{stopLine}</div>
              </>
            ) : (
              "기준지역을 바꾸면 새 대화로 시작합니다. 지금 대화는 대화 이력에 남습니다."
            )
          }
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="acm-btn" onClick={() => setPending(null)}>취소</button>
              <button type="button" className="acm-btn pri" onClick={confirm}>{pending.same ? "기준지역 변경" : "새 대화로 시작"}</button>
            </>
          }
        />
      )}
    </div>
  );
}
