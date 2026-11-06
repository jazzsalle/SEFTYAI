"use client";
import { useAskLock } from "@/lib/askLock";
import "./wx.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import type { Advisory } from "@/lib/contract/agent";
import { baseName, baseTarget } from "@/lib/baseRegion";
import { advTime, advTone, wxLabel } from "@/lib/wxref";
import { SCN_CUT_LABEL, SCN_LABEL } from "@/lib/scenario";
import { BULLETIN_LIMIT, STEP_LIMIT, countAdvisories, stepState, stepsFor, type WxBulletin, type WxBulletinHead, type WxDetailResponse } from "@/lib/wxBulletin";
import { requestWxAsk } from "@/lib/wxAsk";
import { Portal } from "@/components/account/Dialog";
import { IcChevD, IcX } from "@/components/Icons";
import BulletinCard from "./BulletinCard";

const ScnTag = ({ a }: { a: Pick<Advisory, "scenario"> }) => (a.scenario ? <span className="scn-tag">{SCN_LABEL}</span> : null);
const hm = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * 기상특보 상세 (요구사항 UFR-001-001-03 · 개발 서버 nia_ai-frontend AlertDetailModal 을 옮김) — 특보 줄을 펼친 창.
 * 줄은 한 줄로 첫 특보만 말한다. 이 창은 요구사항의 네 가지를 모두 보인다 — 종류·단계 · 발령·변경·해제시각(상태 이력) · 대상지역·발령기관 · 출처·갱신.
 *  · 발효 중 특보 = 특보 줄과 같은 목록(mine — 지금 기준지역을 덮는 것, lib/wxMatch). 고른 특보만 [조건에 반영] · [이 특보로 질의](그 특보가 걸린 행정구역으로 바로 묻는다)
 *  · 상태 이력 = 최근 24시간 통보문의 해당구역·발효시각 줄 가운데 기준지역을 덮는 것(lib/wxBulletin stepsFor). 특보가 모두 풀린 직후가 가장 바쁜 시간이라 둔다
 *  · 전국 발효 현황 = 발효 중 구역을 (종류·단계·해상 여부)별로 센 칩, 머리에 모두 더한 건수(개발 서버 AlertDetailModal, 사용자 결정 2026-11-06 「개발서버대로」).
 *    셈은 특보코드조회(getPwnCd) 구역 코드마다(서버 detail.counts — lib/wxPwn). 받지 못하면 특보 현황 글의 구역 하나를 1건으로(lib/wxBulletin countAdvisories)
 *  · 해상 특보는 이름에 「(해상)」(lib/wxref wxLabel — 개발 서버 WarningCodes.LabelOf)
 *  · 최근 통보문 = 기준지역을 맡는 지방청·본청 통보문 제목. 누르면 그때 본문을 가져온다(한 번 가져온 글은 다시 묻지 않는다 — 발표된 통보문은 고쳐지지 않는다)
 * 시연 시나리오를 켠 시연 계정(R45)은 기상청을 부르지 않는다 — 통보문·상태 이력 자리에 「기상청 실시간 특보 끊음」(「없음」이라 하지 않는다).
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

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const cut = !!weather?.realtimeCut || !!detail?.realtimeCut;
  const all = (weather?.advisories ?? []).filter((a) => a.status !== "해제");
  const steps = detail ? stepsFor(detail.steps, target) : [];
  // 특보코드조회(getPwnCd)로 센 값(개발 서버와 같은 셈). 받지 못했거나 시연 시나리오 계정이면 받은 특보 현황 글로 센다(따로 표시하지 않음)
  const counts: { type: string; level: string; sea: boolean; scenario?: boolean; count: number }[] = detail?.counts ?? countAdvisories(all);
  const total = counts.reduce((n, c) => n + c.count, 0);
  // 상세(특보코드 셈)를 기다린다 — 먼저 글로 센 값을 냈다가 바꾸면 숫자가 뛴다. 받지 못했으면(실패) 글로 센 값
  const countsReady = !!weather && (cut || !!detail || failed || !loading);

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
  const askTitle = (a: Advisory) => {
    if (aimOn) return "AI 모드에서는 브리핑 질문에 현재 특보가 함께 전달됩니다. 이 특보로 물으려면 AI 모드를 끄세요.";
    if (askLocked) return "진행 중인 질문이 끝난 뒤 보낼 수 있습니다";
    const r = detail?.askRegions[a.id];
    return `${r ? baseName(r) : region} 기준으로 바로 묻습니다`;
  };

  const sourceLine = !weather
    ? "기상특보를 확인하고 있습니다"
    : cut
      ? SCN_CUT_LABEL
      : weather.status.ok
        ? `기상청 · 기상특보 조회서비스 · ${hm(weather.status.fetchedAt)} 갱신`
        : `${weather.status.message} · 최종 시도 ${hm(weather.status.fetchedAt)}`;

  return (
    <Portal>
      <div className="ovl" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal wxd" role="dialog" aria-modal="true" aria-labelledby="wxd-title">
          <div className="modal-hd">
            <h2 id="wxd-title">기상특보 상세</h2>
            <span className="sp" />
            <button type="button" className="iconbtn" onClick={onClose} aria-label="닫기"><IcX size={22} /></button>
          </div>
          <div className="modal-bd">
            <div className="wxd-head">
              <b className="wxd-region">{region}</b>
              <span className={`wxd-src ${cut || (weather && !weather.status.ok) ? "warn" : ""}`}>{sourceLine}</span>
              <span className="sp" />
              <button type="button" className="btn ghost sm" disabled={loading} onClick={() => { s.reloadWeather(); load(); }}>
                {loading ? "불러오는 중" : "새로고침"}
              </button>
            </div>

            {/* ── 발효 중 특보 (특보 줄과 같은 목록) ── */}
            <section className="wxd-sec">
              <h3>발효 중 특보</h3>
              {!weather ? (
                <p className="wxd-empty">불러오는 중입니다.</p>
              ) : !mine.length ? (
                <p className="wxd-empty">
                  {cut ? `${region}에는 ${SCN_LABEL} 특보가 없습니다 · ${SCN_CUT_LABEL}` : weather.status.ok ? `${region}에 발효 중인 기상특보가 없습니다.` : "발효 중인 특보를 확인할 수 없습니다."}
                </p>
              ) : (
                <ul className="wxd-list">
                  {mine.map((a) => (
                    <li key={a.id} className="wxd-item">
                      <span className={`lvb ${advTone(a)}`}>{wxLabel(a)}</span>
                      <div className="wxd-body">
                        <p className="wxd-area">
                          {a.area}
                          <ScnTag a={a} />
                        </p>
                        <p className="wxd-meta">{advTime(a.issuedAt)} {a.scenario ? "켬" : "발표"} · 발령기관 {a.scenario ? SCN_LABEL : "기상청"}</p>
                      </div>
                      <div className="wxd-acts">
                        <button type="button" className="btn ghost xs" onClick={() => apply(a)}>조건에 반영</button>
                        <button type="button" className="btn xs" disabled={aimOn || askLocked || (loading && !detail)} title={askTitle(a)} onClick={() => ask(a)}>이 특보로 질의</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── 상태 이력 ── */}
            <section className="wxd-sec">
              <h3>최근 {detail?.hours ?? 24}시간 상태 이력</h3>
              {cut ? (
                <p className="wxd-empty">{SCN_CUT_LABEL}</p>
              ) : failed || (detail && !detail.ok) ? (
                <p className="wxd-alarm" role="alert">기상청 통보문을 불러오지 못했습니다. 잠시 뒤 [새로고침]을 눌러 주세요.</p>
              ) : !detail ? (
                <p className="wxd-empty">불러오는 중입니다.</p>
              ) : !steps.length ? (
                <p className="wxd-empty">최근 {detail.hours}시간 동안 {region}에 걸리거나 풀린 특보가 없습니다.</p>
              ) : (
                <ol className="wxd-steps">
                  {steps.map((st) => (
                    <li key={`${st.key}-${st.no}`} className="wxd-step">
                      <span className={`wxd-state ${stepState(st.title)}`}>{st.title}</span>
                      <span className="wxd-step-area">{st.areas}</span>
                      <span className="wxd-step-at">
                        {st.at && <>{st.at} · </>}
                        {st.stnName} 제{st.seq}호 {advTime(st.announcedAt)} 발표
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {detail && detail.steps.length >= STEP_LIMIT && <p className="wxd-note">최신 {STEP_LIMIT}단계까지만 보입니다.</p>}
            </section>

            {/* ── 전국 ── */}
            <section className="wxd-sec">
              <h3>
                전국 발효 현황
                <span className="wxd-count">{countsReady ? `${total}건` : "—"}</span>
              </h3>
              {!countsReady ? (
                <p className="wxd-empty">불러오는 중입니다.</p>
              ) : !counts.length ? (
                <p className="wxd-empty">{cut ? SCN_CUT_LABEL : weather.status.ok ? "전국에 발효 중인 기상특보가 없습니다." : "발효 중인 특보를 확인할 수 없습니다."}</p>
              ) : (
                <ul className="wxd-chips">
                  {counts.map((c) => (
                    <li key={`${c.type}|${c.level}|${c.sea}|${c.scenario}`} className="wxd-chip">
                      {wxLabel(c)}
                      <ScnTag a={c} />
                      <b>{c.count}</b>
                    </li>
                  ))}
                </ul>
              )}
              {cut && all.length > 0 && <p className="wxd-note">{SCN_CUT_LABEL}</p>}
            </section>

            {/* ── 통보문 ── */}
            <section className="wxd-sec">
              <h3>최근 통보문</h3>
              {cut ? (
                <p className="wxd-empty">{SCN_CUT_LABEL}</p>
              ) : failed || (detail && !detail.ok) ? (
                <p className="wxd-alarm" role="alert">기상청 통보문을 불러오지 못했습니다. 잠시 뒤 [새로고침]을 눌러 주세요.</p>
              ) : !detail ? (
                <p className="wxd-empty">불러오는 중입니다.</p>
              ) : !detail.bulletins.length ? (
                <p className="wxd-empty">최근 {detail.hours}시간 동안 받은 통보문이 없습니다.</p>
              ) : (
                <ul className="wxd-msgs">
                  {detail.bulletins.map((b) => <BulletinRow key={b.key} b={b} />)}
                </ul>
              )}
              {detail && detail.failed.length > 0 && detail.ok && <p className="wxd-note">통보문을 받지 못한 지점: {detail.failed.join(", ")}</p>}
              {detail?.bulletinsMore && <p className="wxd-note">최신 {BULLETIN_LIMIT}장까지만 보입니다.</p>}
            </section>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** 통보문 한 줄 — 누르면 본문을 그때 가져온다 */
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
    <li className="wxd-msg">
      <button type="button" className="wxd-msg-hd" aria-expanded={open} onClick={toggle}>
        <span className="wxd-msg-at">{advTime(b.announcedAt)}</span>
        <span className="wxd-msg-stn">{b.stnName}<span className="wxd-tag">{b.areaLabel}</span></span>
        <span className="wxd-msg-title">{b.title}</span>
        <span className="wxd-msg-seq">제{b.seq}호</span>
        <IcChevD size={16} className={open ? "open" : ""} />
      </button>
      {open && (
        <div className="wxd-msg-bd">
          {state === "loading" ? (
            <p className="wxd-empty">본문을 불러오는 중입니다.</p>
          ) : state === "failed" ? (
            <p className="wxd-alarm" role="alert">본문을 불러오지 못했습니다. 접었다 다시 펴 보세요.</p>
          ) : full ? (
            <BulletinCard b={full} />
          ) : null}
        </div>
      )}
    </li>
  );
}
