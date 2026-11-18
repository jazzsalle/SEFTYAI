"use client";
import { useAskLock } from "@/lib/askLock";
import "./wx.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import type { Advisory } from "@/lib/contract/agent";
import { baseName, baseTarget } from "@/lib/baseRegion";
import { wxLabel } from "@/lib/wxref";
import { isSeaArea, wxCovers } from "@/lib/wxMatch";
import { STEP_LIMIT, countAdvisories, scenarioSteps, stepState, stepsFor, type WxBulletin, type WxBulletinHead, type WxDetailResponse } from "@/lib/wxBulletin";
import type { PwnChange } from "@/lib/wxPwn";
import { requestWxAsk } from "@/lib/wxAsk";
import { Dialog } from "@/components/account/Dialog";
import BulletinCard from "./BulletinCard";

/** 시안 표기 10.28 17:05(개발서버 AlertDetailModal dateTime). 날짜가 없으면 빈 글자 — 부르는 쪽이 「미제공」을 적는다 */
export const wxDateTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 발효 · 변경 · 해제 → 색(개발서버 stateKey) */
const changeState = (state: string) => (state.startsWith("해제") ? "ended" : state === "변경" ? "changed" : "raised");

/**
 * 기준지역의 최근 상태이력(특보코드 장부 — 개발서버 overview.recent) — 기준지역을 덮는 단계(lib/wxMatch)만, 최신순. 시연 특보(자동 시연 가상 특보·시나리오 특보)가
 * 줄에 떠 있으면 그 발효 단계를 함께 싣는다(서버 장부에 없는 특보라 — 진짜 특보처럼 보이게). 특보코드를 받지 못했으면 null(통보문 단계로 대신)
 */
export function recentFor(detail: WxDetailResponse | null, mine: Advisory[], target: Parameters<typeof wxCovers>[1]): PwnChange[] | null {
  if (!detail?.recent) return null;
  const have = new Set(detail.recent.map((c) => c.key));
  return [...detail.recent.filter((c) => wxCovers(c.area, target)), ...scenarioSteps(mine).filter((c) => !have.has(c.key))].sort((a, b) => b.at.localeCompare(a.at));
}

/** 기상청 단계 제목(「한파주의보 발표」「호우경보 해제」) → 특보 이름 · 상태 낱말 */
const splitStep = (title: string): [string, string] => {
  const m = title.trim().match(/^(.*\S)\s+(\S+)$/);
  return m ? [m[1], m[2]] : [title, ""];
};

/**
 * 기상특보 상세 — 개발서버 AlertDetailModal(오른쪽 서랍 modal--alert) 그대로(2026-11-19 「개발서버와 동일하게」)
 * 출처·갱신 → (실패 안내) → 발효 중 특보(줄과 같은 목록 — 지금 기준지역을 덮는 것) → 최근 24시간 상태이력 → 전국 발효 현황 → 최근 통보문(펼칠 때 본문)
 *  · 발효 중 특보마다 구역 이름 · 해상 · 신규/변경 표지, 발효(startTime)·발표(tmFc)·발령기관·구역코드(개발서버 AlertDetailModal)
 *  · 상태이력 = 특보코드 장부의 발효·변경·해제 단계(시각 · 상태 · 특보 · 구역), 최신 100건(개발서버 recent·capped)
 *  · 발효 중 특보마다 [조건에 반영] · [이 특보로 질의](그 특보가 걸린 행정구역으로 바로 묻는다 — AI 모드·질문이 꽉 찼을 때는 막음)
 *  · 시연 시나리오 특보는 표지 없이 진짜 특보처럼 보인다(개발서버 가상 특보와 같이)
 * 열 때 한 번 묻고, 그다음은 [새로고침]을 누를 때만 — 상세는 1분마다 긁을 값이 아니다
 */
export default function WxDetailModal({ mine, onClose }: { mine: Advisory[]; onClose: () => void }) {
  const s = useSession();
  const { weather, cond, aimOn } = s;
  // 질문을 더 받을 수 없을 때(넷이 다 돌거나 브리핑 중 — 개발서버 AlertDetailModal askDisabled · R57)
  const askLocked = useAskLock().locked;
  const router = useRouter();
  const path = usePathname();
  const [detail, setDetail] = useState<WxDetailResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const sido = cond.base?.sido.code ?? "";
  const target = baseTarget(cond.base);
  const region = baseName(cond.base);

  const load = useCallback(() => {
    alive.current = true;
    setLoading(true);
    api<WxDetailResponse>(`/api/weather/detail${sido ? `?sido=${sido}` : ""}`)
      .then((d) => {
        if (!alive.current) return;
        setDetail(d);
        setFailed(false);
      })
      .catch(() => alive.current && setFailed(true))
      .finally(() => alive.current && setLoading(false));
  }, [sido]);

  useEffect(() => {
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const all = (weather?.advisories ?? []).filter((a) => a.status !== "해제");
  // 상태이력 — 특보코드 장부(개발서버 recent). 받지 못했으면 통보문 단계(예전 방식)
  const recent = recentFor(detail, mine, target);
  const steps = detail && !recent ? stepsFor(detail.steps, target) : [];
  const recentShown = recent?.slice(0, STEP_LIMIT) ?? [];
  // 특보코드조회(getPwnCd)로 센 값(개발 서버와 같은 셈). 받지 못했으면 받은 특보 현황 글로 센다
  const counts: { type: string; level: string; sea: boolean; count: number }[] = detail?.counts ?? countAdvisories(all);
  const total = counts.reduce((n, c) => n + c.count, 0);
  // 상세(특보코드 셈)를 기다린다 — 먼저 글로 센 값을 냈다가 바꾸면 숫자가 뛴다
  const countsReady = !!weather && (!!detail || failed || !loading);
  const hours = detail?.hours ?? 24;

  const apply = (a: Advisory) => {
    // 조건 창의 특보 단계는 주의보·경보만 고른다 — 그 밖(예비특보)은 종류만 넣는다
    s.setCond({ warningKind: a.type, warningLevel: a.level === "경보" || a.level === "주의보" ? a.level : undefined });
    s.toast(`${wxLabel(a)}를 재난상황 조건에 넣었습니다.`);
  };
  const ask = (a: Advisory) => {
    const r = detail?.askRegions[a.id];
    requestWxAsk({ adv: a, ...(r ? { base: r } : {}) });
    onClose();
    if (!path?.startsWith("/explore")) router.push("/explore");
  };

  // 출처 줄 — 「기상청 · 기상특보 조회서비스 · 10.28 17:05 갱신」(개발서버 sourceLine)
  const sourceLine = !weather
    ? "출처를 아직 확인하지 못했습니다."
    : ["기상청", "기상특보 조회서비스", weather.status.ok && wxDateTime(weather.status.fetchedAt) ? `${wxDateTime(weather.status.fetchedAt)} 갱신` : "갱신 기록 없음"].join(" · ");
  const loadingText = loading ? "불러오는 중입니다." : "내용이 없습니다.";

  return (
    <Dialog title="기상특보 상세" drawer className="wxd" onClose={onClose}>
      {/* ── 출처 · 갱신 ── */}
      <div className="wx-head">
        <span className="wx-region">{region}</span>
        <p className="wx-source">{sourceLine}</p>
        <button type="button" className="wx-refresh" disabled={loading} onClick={() => { s.reloadWeather(); load(); }}>
          {loading ? "불러오는 중" : "새로고침"}
        </button>
      </div>

      {/* 서버에 닿지 못한 것도 「조회 실패」와 같은 뜻이다 — 특보가 없다고 말하면 안 된다 */}
      {failed || (detail && !detail.ok) ? (
        <p className="wx-alarm" role="alert">특보를 불러오지 못했습니다. 잠시 뒤 [새로고침] 을 눌러 주세요.</p>
      ) : weather && !weather.status.ok ? (
        <p className="wx-alarm" role="alert">기상청 조회가 실패했습니다. 아래 내용은 이전 기준입니다.</p>
      ) : null}

      {/* ── 발효 중 특보 (특보 줄과 같은 목록) ── */}
      <section className="wx-section">
        <h3 className="wx-section-title">
          발효 중 특보
          <span className="wx-count">{weather ? `${mine.length}건` : "—"}</span>
        </h3>
        {!weather ? (
          <p className="wx-empty">{loadingText}</p>
        ) : !mine.length ? (
          <p className="wx-empty">{weather.status.ok ? `${region}에 발효 중인 특보가 없습니다.` : "발효 중인 특보를 확인할 수 없습니다."}</p>
        ) : (
          <ul className="wx-list">
            {mine.map((a) => {
              const lockedAsk = aimOn || askLocked || (loading && !detail);
              return (
                <li key={a.id} className="wx-item">
                  <span className={`wx-badge${a.level === "주의보" ? " wx-badge--watch" : ""}`}>{wxLabel(a)}</span>
                  <div className="wx-item-body">
                    <p className="wx-item-area">
                      {a.areaName ?? a.area}
                      {(a.sea ?? isSeaArea(a.area)) && <span className="wx-tag">해상</span>}
                      {a.changeType && <span className="wx-tag wx-tag--change">{a.changeType}</span>}
                    </p>
                    {/* 특보코드 구역이면 발효(startTime)·발표(tmFc)·구역코드가 따로 온다. 특보 현황 글로만 받았으면 현황 한 장의 발표 시각뿐 — 발효는 「미제공」 */}
                    <dl className="wx-fields">
                      <dt>발효</dt>
                      <dd>{wxDateTime(a.areaCode ? a.effectiveAt : null) || "미제공"}</dd>
                      <dt>발표</dt>
                      <dd>{wxDateTime(a.areaCode ? a.announcedAt : a.issuedAt) || "미제공"}</dd>
                      <dt>발령기관</dt>
                      <dd>기상청</dd>
                      <dt>구역코드</dt>
                      <dd>{a.areaCode || "미제공"}</dd>
                    </dl>
                  </div>
                  <div className="wx-actions">
                    <button type="button" className="wx-apply" onClick={() => apply(a)}>조건에 반영</button>
                    <button
                      type="button"
                      className="wx-apply wx-apply--ask"
                      disabled={lockedAsk}
                      title={askLocked ? "진행 중인 질문이 끝난 뒤 보낼 수 있습니다" : aimOn ? undefined : `${wxLabel(a)} 기준으로 바로 묻습니다`}
                      onClick={() => ask(a)}
                    >
                      이 특보로 질의
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 상태이력 ── */}
      <section className="wx-section">
        <h3 className="wx-section-title">
          최근 {hours}시간 상태이력
          <span className="wx-count">
            {!detail ? "—" : recent ? (recent.length > recentShown.length ? `${recent.length}건 · 최신 ${recentShown.length}건` : `${recent.length}건`) : `${steps.length}건`}
          </span>
        </h3>
        {!detail ? (
          <p className="wx-empty">{loadingText}</p>
        ) : recent ? (
          !recent.length ? (
            <p className="wx-empty">최근 {hours}시간 동안 걸리거나 풀린 특보가 없습니다.</p>
          ) : (
            <ol className="wx-timeline">
              {recentShown.map((c, i) => (
                <li key={`${c.key}-${c.state}-${i}`} className="wx-step">
                  <span className="wx-step-at">{wxDateTime(c.at)}</span>
                  <span className={`wx-state wx-state--${changeState(c.state)}`}>{c.state}</span>
                  <span className="wx-step-label">{wxLabel({ type: c.kind, level: c.level, sea: c.sea })}</span>
                  <span className="wx-step-area">
                    {c.areaName}
                    {c.sea && <span className="wx-tag">해상</span>}
                  </span>
                </li>
              ))}
            </ol>
          )
        ) : !steps.length ? (
          <p className="wx-empty">최근 {hours}시간 동안 걸리거나 풀린 특보가 없습니다.</p>
        ) : (
          <ol className="wx-timeline">
            {steps.map((st) => {
              const [label, state] = splitStep(st.title);
              return (
                <li key={`${st.key}-${st.no}`} className="wx-step">
                  <span className="wx-step-at">{wxDateTime(st.announcedAt)}</span>
                  <span className={`wx-state wx-state--${stepState(st.title)}`}>{state}</span>
                  <span className="wx-step-label">{label}</span>
                  <span className="wx-step-area" title={st.areas}>{st.areas}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ── 전국 ── */}
      <section className="wx-section">
        <h3 className="wx-section-title">
          전국 발효 현황
          <span className="wx-count">{countsReady ? `${total}건` : "—"}</span>
        </h3>
        {!countsReady ? (
          <p className="wx-empty">{loadingText}</p>
        ) : !counts.length ? (
          <p className="wx-empty">전국에 발효 중인 특보가 없습니다.</p>
        ) : (
          <ul className="wx-chips">
            {counts.map((c, i) => (
              <li key={`${c.type}|${c.level}|${c.sea}|${i}`} className="wx-chip">
                {wxLabel(c)}
                <b>{c.count}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 통보문 ── */}
      <section className="wx-section">
        <h3 className="wx-section-title">
          최근 통보문
          <span className="wx-count">{detail ? (detail.bulletinsMore ? `최신 ${detail.bulletins.length}장` : `${detail.bulletins.length}장`) : "—"}</span>
        </h3>
        {!detail ? (
          <p className="wx-empty">{loadingText}</p>
        ) : !detail.bulletins.length ? (
          <p className="wx-empty">최근 {hours}시간 동안 받은 통보문이 없습니다.</p>
        ) : (
          <ul className="wx-msgs">
            {detail.bulletins.map((b) => <BulletinRow key={b.key} b={b} />)}
          </ul>
        )}
      </section>
    </Dialog>
  );
}

/** 통보문 한 줄 — 누르면 본문을 그때 가져온다(한 번 가져온 글은 다시 묻지 않는다) */
export function BulletinRow({ b }: { b: WxBulletinHead }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<WxBulletin | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || full || state === "loading") return;
    setState("loading");
    api<WxBulletin>(`/api/weather/bulletin?key=${encodeURIComponent(b.key)}`)
      .then((d) => {
        setFull(d);
        setState("idle");
      })
      .catch(() => setState("failed"));
  };
  return (
    <li className="wx-msg">
      <button type="button" className="wx-msg-head" aria-expanded={open} onClick={toggle}>
        <span className="wx-msg-at">{wxDateTime(b.announcedAt)}</span>
        <span className="wx-msg-stn">{b.stnName}<span className="wx-tag">{b.areaLabel}</span></span>
        <span className="wx-msg-title">{b.title}</span>
        <span className="wx-msg-seq">제{b.seq}호</span>
        <span className={`wx-msg-caret${open ? " is-open" : ""}`} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="wx-msg-body">
          {state === "loading" ? (
            <p className="wx-msg-note">본문을 불러오는 중입니다.</p>
          ) : state === "failed" ? (
            <p className="wx-msg-note wx-msg-note--fail" role="alert">본문을 불러오지 못했습니다. 접었다 다시 펴 보세요.</p>
          ) : full ? (
            <BulletinCard b={full} />
          ) : null}
        </div>
      )}
    </li>
  );
}
