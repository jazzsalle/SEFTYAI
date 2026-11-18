"use client";
/**
 * 머리줄 기준지역 고르기(R32) — 전국 → 시·도 → 시·군·구 → 읍·면·동. 지자체·중앙 모두 바꿀 수 있다.
 *  · 선택지는 /api/regions(브이월드 행정구역 이름·코드)에서만 — 부모 코드별로 한 번 받아 이 탭 메모리에 둔다. 받는 중·받지 못하면
 *    「전국」(지금 고른 값이 있으면 그 값)만 두고, 받지 못하면 짧은 안내와 다시 불러오기를 보인다(지어낸 보기 없음)
 *  · 답변 중에도 바꿀 수 있다(개발서버 352a97c FUN-UFR-101002 — R62, 전 R60 ⑦ 잠금 없앰). 바꾸면 AI 모드는 꺼진다(R47 — 세션 setBase)
 *  · 같은 시·도 안에서만 바꾸면(AI 모드 꺼짐) 묻지 않고 바꾸고 대화를 유지한다 — 통합 탐색이 그 자리에 구분선(REGION_BREAK_EVENT)
 *  · 잃을 것이 없으면(지금 대화에 질문이 없고 AI 모드도 꺼짐) 묻지 않고 바꾼다 — 개발서버 requestRegionChange 판정 그대로(lib/dialogue regionChangeStep)
 *  · 그 밖에는 확인 창 — 모양·글·단추는 개발서버 SearchSessionProvider 의 Modal 그대로(lib/dialogue regionChangeDialog, 전 R47 번호 줄 형식 버림).
 *    [새 대화로 시작] = 지금 대화의 도는 질문을 멈추고(대기 중인 브리핑 항목은 보내지 않음) 기준지역을 바꾼 뒤 새 대화(통합 탐색이면 sa:new-conv)
 *  · AI 모드를 켠 채 같은 시·도 안에서 바꾸면 AI 모드 종료 안내만 묻고 [기준지역 변경] — 대화는 유지
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { baseKey, baseName, type AreaPick, type BaseRegion } from "@/lib/baseRegion";
import { activityOf, isSameProvince, openConvBus, REGION_BREAK_EVENT, regionChangeDialog, regionChangeStep, useOpenConv } from "@/lib/dialogue";
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
  const [pending, setPending] = useState<{ base: BaseRegion | null; same: boolean } | null>(null);
  const path = usePathname();
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
  /** 시·도가 바뀌는 변경 — 지금 대화의 도는 질문을 멈추고(대기 중·보내는 중인 질문은 보내지 않는다) 기준지역을 바꾼 뒤 새 대화로(개발서버 confirmRegionChange·applyRegion) */
  const applyOther = (next: BaseRegion | null) => {
    const cur = openConvBus.get();
    openConvBus.markLeft(cur.convId);
    for (const id of activityOf(cur.turns, (j) => s.jobs[j]?.state).jobIds) void s.cancel(id).catch(() => {});
    openConvBus.reset();
    s.setBase(next);
    // 통합 탐색 화면의 「새 대화」와 같게 — 빈 대화(시작 화면)로. 다른 화면이면 옮기지 않는다(개발서버도 그 자리에서 대화만 비운다 — 통합 탐색은 열 때 빈 대화)
    if (path?.startsWith("/explore")) window.dispatchEvent(new CustomEvent("sa:new-conv"));
  };
  // 개발서버 requestRegionChange — 같은 시·도 안(AI 모드 꺼짐)은 그대로, 잃을 것이 없으면 묻지 않고, 그 밖에는 확인 창
  const request = (next: BaseRegion | null) => {
    if (baseKey(next) === baseKey(base)) return;
    const same = isSameProvince(base, next);
    const step = regionChangeStep({ same, aimOn: s.aimOn, hasTurns: openConvBus.get().turns.length > 0 });
    if (step === "same") return applySame(next);
    if (step === "apply") return applyOther(next);
    setPending({ base: next, same });
  };
  const confirm = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    // 같은 시·도 안이면(AI 모드 종료 확인만 받은 경우) 대화는 유지한다
    if (p.same) return applySame(p.base);
    applyOther(p.base);
  };
  // 창의 글 — AI 모드는 지금 켜져 있는지로(개발서버 aiMode.on), 중지 안내는 시·도가 바뀔 때만
  const dlg = pending ? regionChangeDialog({ same: pending.same, aimOn: s.aimOn, running: act.running, waiting: act.waiting }) : null;
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
      {pending && dlg && (
        <Dialog
          title={dlg.title}
          desc={dlg.desc}
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="acm-btn" onClick={() => setPending(null)}>취소</button>
              <button type="button" className="acm-btn pri" onClick={confirm}>{dlg.ok}</button>
            </>
          }
        />
      )}
    </div>
  );
}
