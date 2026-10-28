"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { isActive, receivedAt, STATE_LABEL, type JobFull, type JobSummary, type T3qRef, type WxSeen } from "@/lib/jobTypes";
import { gapName, GAP_KO, statusKo } from "@/lib/labels";
import { fmtAgo, fmtElapsed, fmtRunning } from "@/lib/format";
import { activeAdvisories, advLabel, advTime } from "@/lib/wxref";
import { PILOT_T3Q } from "@/lib/t3q/region";
import type { Advisory, RegionId, WeatherResponse } from "@/lib/contract/agent";
import { useExplore } from "../explore/ExploreCtx";
import { IcChevD } from "../Icons";
import { AnswerMarkdown, entityLabel, mdPlainText } from "./Markdown";
import "./answer.css";

export { entityLabel } from "./Markdown";

/**
 * 에이전트 답 카드 (Figma 203001 · 시각 설계 08 C·D — 적용 범위 R25) — T3Q 원응답(raw)을 그대로 보인다(R0·R5).
 * 진행 중: 경과 시계(「1분 45초째」)·취소 / 완료: 머리(처리 시간 = 제공처 meta.elapsed_ms · 도구: 답변 대상 거르기·답변 복사) ·
 * 주의(재사용 D5 · 받은 뒤 특보 C9 · 경고·정보 부족 바로가기 — 있을 때만) · 마크다운 · 답변 대상(refs 순서 그대로, 종류 거르기 C3) ·
 * 경고·정보 부족·한계(제자리, 문구 그대로) · 원문 보기·복사(C10) · 평가 · 이어서 묻기.
 * 유엔이가 센 값·설명 문구는 두지 않는다.
 */

/** 이 답을 보낸 기준지역 — 요청 query_context.region 행정코드(서버 jobs.regionOf 와 같은 규칙). 지역을 보내지 않았으면 전국, 시범지역 밖·요청 없음이면 null */
export function regionOfRequest(request: unknown): RegionId | null {
  if (!request || typeof request !== "object") return null;
  const qc = (request as { query_context?: { region?: { admin_code?: unknown } | null } | null }).query_context;
  const code = String(qc?.region?.admin_code ?? "");
  if (!code) return "national";
  const digits = { SIDO: 2, SIGUNGU: 5, EMD: 8 } as const;
  const ids = Object.keys(PILOT_T3Q) as Exclude<RegionId, "national">[];
  return ids.find((id) => code.startsWith(PILOT_T3Q[id].admin_code.slice(0, digits[PILOT_T3Q[id].level]))) ?? null;
}

/** 이 답을 받은 때 발효 중이던 특보(서버가 남긴 목록) — 재사용이면 원래 답을 받은 때의 것. 모르면 null */
export function seenAdvisories(job: JobSummary, full?: JobFull | null): WxSeen[] | null {
  if (job.cached_from) return job.source_wx_seen ?? full?.source_wx_seen ?? null;
  return job.wx_seen ?? full?.wx_seen ?? null;
}

/**
 * 답을 받은 뒤 그 지역에 새로 발표된 특보(받은 순서 그대로) — 답을 받은 때 발효 중이던 특보 목록(seen)에 없고,
 * 기상청 발표 시각도 받은 시각(at) 뒤인 것만. 특보 현황의 발표 시각(issuedAt)은 특보마다의 시각이 아니라 현황 한 장의 시각이라
 * 그것만으로는 가리지 않는다(다른 지역 특보가 새로 나와도 시각이 바뀐다). 기준지역이면 같은 지역·종류·단계가 그때 있었는지,
 * 전국이면 같은 특보(구역 포함)가 있었는지로 본다. 무엇이든 모르면(특보 조회 실패·목록 없음·시각 없음) 빈 목록 — 주의를 지어내지 않는다
 */
export function advisoriesAfter(weather: WeatherResponse | null | undefined, region: RegionId | null, at: string | null, seen: WxSeen[] | null | undefined): Advisory[] {
  if (!weather?.status.ok || !region || !at || !seen) return [];
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return [];
  const known = (a: Advisory) =>
    seen.some((w) => (region === "national" ? w.id === a.id : w.regionId === a.regionId && w.type === a.type && w.level === a.level));
  return activeAdvisories(weather, region).filter((a) => {
    const i = Date.parse(a.issuedAt);
    return Number.isFinite(i) && i > t && !known(a);
  });
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** 앱 시각 → 「2026-10-28 02:48」(이 컴퓨터 시간대). 읽지 못하면 받은 글자 그대로 */
export function fmtYmdHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
const advText = (a: Advisory) => `${a.area} ${advLabel(a)} ${advTime(a.issuedAt)}`;

type CardProps = { job: JobSummary; full: JobFull | undefined; compact?: boolean };

/** 작업이 바뀌면(다시 질의·새로 받기) 카드 상태를 새로 시작한다 */
export default function AnswerCard(props: CardProps) {
  return <Card key={props.job.id} {...props} />;
}

function Card({ job, full, compact }: CardProps) {
  const s = useSession();
  const x = useExplore();
  const raw = full?.raw ?? null;
  const res = raw?.result ?? null;
  const refs = useMemo(() => (res?.refs ?? []) as T3qRef[], [res]);
  const types = useMemo(() => [...new Set(refs.map((r) => r.entity_type ?? ""))], [refs]);
  const active = isActive(job.state);
  const reused = !!job.cached_from;
  const [now, setNow] = useState(() => Date.now());
  const [showRaw, setShowRaw] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [fold, setFold] = useState(false);
  const [typeF, setTypeF] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const region = useMemo(() => regionOfRequest(full?.request), [full?.request]);
  const at = receivedAt(job, full);
  const seen = seenAdvisories(job, full);
  const after = useMemo(() => advisoriesAfter(s.weather, region, at, seen), [s.weather, region, at, seen]);

  // 진행 중은 1초마다(경과 시계), 재사용 답은 1분마다(「n시간 전」)
  useEffect(() => {
    if (!active && !reused) return;
    const t = setInterval(() => setNow(Date.now()), active ? 1000 : 60_000);
    return () => clearInterval(t);
  }, [active, reused]);

  if (active) {
    const ms = now - new Date(job.created_at).getTime();
    return (
      <div className="acard loading" aria-busy="true">
        <div className="acard-h"><span className="ai-dot spin" /> <b>재난안전 AI</b> <span className="xs muted">{STATE_LABEL[job.state]}</span></div>
        <div className="s" style={{ marginTop: 8 }}>
          답변을 만드는 중입니다 · <b>{fmtRunning(ms)}</b>
        </div>
        {ms > 600_000 && <div className="notice warn" style={{ marginTop: 8 }}>10분이 지났습니다. 계속 기다리거나 취소할 수 있습니다(15분이 지나면 자동으로 끝냅니다).</div>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => s.cancel(job.id).catch(() => s.toast("취소하지 못했습니다."))}>질의 취소</button>
        </div>
      </div>
    );
  }

  // 완료됐지만 원응답을 아직 못 받은 경우 — 실패가 아니라 불러오는 중
  if (job.state === "DONE" && !raw) return <div className="acard loading" aria-busy="true"><span className="ai-dot spin" /> 답변을 불러오는 중…</div>;
  if (job.state !== "DONE" || !raw) {
    const msg = job.state === "LOST" ? "에이전트 서버가 다시 시작되어 작업이 사라졌습니다." : job.state === "TIMEOUT" ? "15분 안에 답을 받지 못해 끝냈습니다." : job.state === "CANCELLED" ? "취소한 질의입니다." : "답변을 받지 못했습니다.";
    return (
      <div className="acard err">
        <div className="acard-h"><b>재난안전 AI</b> <span className="badge danger">{STATE_LABEL[job.state]}</span></div>
        <div className="s" style={{ marginTop: 8 }}>{msg}</div>
        {raw && <RawFoot raw={raw} />}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm pri" onClick={() => x.retry(job.id)}>다시 질의</button>
        </div>
      </div>
    );
  }

  const answer = typeof res?.answer === "string" ? res.answer : null;
  const elapsed = raw.meta?.elapsed_ms;
  const hasNotice = !!(raw.warnings?.length || raw.data_gaps?.length);
  const noticeId = `notices-${job.id}`;
  const refsId = `refs-${job.id}`;
  const shown = typeF === null ? refs : refs.filter((r) => (r.entity_type ?? "") === typeF);
  const activeRef = x.selectedKey?.startsWith(job.id + ":") ? x.selectedKey.slice(job.id.length + 1) : null;
  const ago = at ? fmtAgo(now - Date.parse(at)) : null;

  const togglePick = (r: string) => setPicked((p) => (p.includes(r) ? p.filter((v) => v !== r) : [...p, r]));
  const goTo = (id: string, block: ScrollLogicalPosition) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block });
    el?.focus({ preventScroll: true });
  };
  const pickType = (t: string | null) => {
    setTypeF(t);
    goTo(refsId, "start");
  };
  const copy = (text: string, done: string) => {
    if (!navigator.clipboard) return s.toast("복사하지 못했습니다.");
    navigator.clipboard.writeText(text).then(() => s.toast(done), () => s.toast("복사하지 못했습니다."));
  };
  const copyPlain = () => {
    const md = bodyRef.current?.querySelector(".md");
    if (md) copy(mdPlainText(md), "답변을 서식 없는 글로 복사했습니다.");
  };
  const copyMd = () => answer && copy(answer, "답변 마크다운 원문을 복사했습니다.");
  const renew = () => {
    setRenewing(true);
    x.retry(job.id);
    setTimeout(() => setRenewing(false), 5000);
  };

  return (
    <div className="acard ans">
      <div className="acard-h">
        <span className="ai-dot" /> <b>재난안전 AI</b>
        <span className="xs muted">
          {[
            raw.meta?.base_time ? `${raw.meta.base_time} 기준` : null,
            raw.status && raw.status !== "SUCCESS" ? statusKo(raw.status) : null,
            typeof elapsed === "number" ? `처리 ${fmtElapsed(elapsed)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="sp" />
        <div className="ans-tools" role="toolbar" aria-label="답변 도구">
          {!compact && answer && answer.length > 2500 && <button className="lnk xs" onClick={() => setFold((v) => !v)}>{fold ? "전체 보기" : "접기"}</button>}
          {refs.length > 0 && (
            <Menu label="답변 대상">
              {(close) => (
                <>
                  <button type="button" role="menuitemradio" aria-checked={typeF === null} onClick={() => { close(); pickType(null); }}>전체</button>
                  {types.map((t) => (
                    <button key={t} type="button" role="menuitemradio" aria-checked={typeF === t} onClick={() => { close(); pickType(t); }}>{entityLabel(t || null)}</button>
                  ))}
                </>
              )}
            </Menu>
          )}
          {answer && (
            <Menu label="답변 복사">
              {(close) => (
                <>
                  <button type="button" role="menuitem" onClick={() => { close(); copyPlain(); }}>서식 없는 글</button>
                  <button type="button" role="menuitem" onClick={() => { close(); copyMd(); }}>마크다운 원문</button>
                </>
              )}
            </Menu>
          )}
        </div>
      </div>

      {reused && (
        <div className="ans-reuse" role="note">
          <span>
            <b>이전 답변 재사용</b>
            {at ? ` · ${fmtYmdHm(at)} 받은 답${ago ? `(${ago})` : ""}` : ""}
          </span>
          {after.length > 0 && <span className="ans-flag">받은 뒤 특보 바뀜</span>}
          <span className="sp" />
          <button type="button" className="btn sm pri" disabled={renewing} onClick={renew}>새로 받기</button>
        </div>
      )}
      {after.length > 0 && <div className="ans-caution" role="note">⚠ 답변을 받은 뒤 특보 발표: {after.map(advText).join(" · ")}</div>}
      {hasNotice && <button type="button" className="ans-jump" onClick={() => goTo(noticeId, "center")}>경고·정보 부족 보기 ↓</button>}

      {answer ? (
        <div ref={bodyRef} className={fold ? "acard-body folded" : "acard-body"}>
          <AnswerMarkdown text={answer} refs={refs} activeRef={activeRef} onRef={(r) => x.showOnMap(job.id, r.ref)} />
        </div>
      ) : (
        <div className="s muted" style={{ marginTop: 8 }}>답변 글이 없습니다({statusKo(raw.status)}).</div>
      )}
      {fold && <button className="lnk s" onClick={() => setFold(false)}>전체 보기 ▼</button>}

      {refs.length > 0 && (
        <div className="refbox" id={refsId} tabIndex={-1}>
          <div className="row">
            <b className="s">답변 대상</b>
            <span className="sp" />
            <button className="btn xs" onClick={() => x.showOnMap(job.id)}>지도에서 모두 보기</button>
          </div>
          {types.length > 1 && (
            <div className="ans-filter" role="group" aria-label="답변 대상 종류">
              <button type="button" className="ans-fchip" aria-pressed={typeF === null} onClick={() => setTypeF(null)}>전체</button>
              {types.map((t) => (
                <button key={t} type="button" className="ans-fchip" aria-pressed={typeF === t} onClick={() => setTypeF(t)}>{entityLabel(t || null)}</button>
              ))}
            </div>
          )}
          <ul className="reflist">
            {shown.map((r) => (
              <li key={r.ref} className={activeRef === r.ref ? "on" : undefined}>
                <label className="pick">
                  <input type="checkbox" aria-label={`${r.display_name ?? r.ref} — 이어서 묻기에 참조`} checked={picked.includes(r.ref)} onChange={() => togglePick(r.ref)} />
                </label>
                <button className="lnk" onClick={() => x.showOnMap(job.id, r.ref)}>{r.display_name ?? r.ref}</button>
                <span className="xs muted">{entityLabel(r.entity_type)}</span>
                <span className="sp" />
                <button className="lnk xs" onClick={() => x.showOnMap(job.id, r.ref)}>지도에서 보기</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RawFoot raw={raw} id={noticeId} />

      <div className="acard-actions">
        <button className="btn xs" onClick={() => setShowRaw((v) => !v)}>{showRaw ? "원문 닫기" : "원문 보기"}</button>
        {answer && <button className="btn xs" onClick={copyPlain}>답변 복사</button>}
        {answer && <button className="btn xs" onClick={copyMd}>마크다운 원문 복사</button>}
        <button className="btn xs" onClick={() => x.followUp(job.id, refs.filter((r) => picked.includes(r.ref)))}>
          이어서 묻기{picked.length ? ` (참조 ${picked.length})` : ""}
        </button>
        <span className="sp" />
        <Feedback jobId={job.id} />
      </div>
      {showRaw && <pre className="rawbox">{answer ?? JSON.stringify(raw, null, 2)}</pre>}
    </div>
  );
}

/** 머리 줄 펼침 메뉴 — 바깥을 누르거나 Esc 면 닫힌다 */
function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(box.current?.querySelectorAll<HTMLButtonElement>("[role=menu] button") ?? []);
    items()[0]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const list = items();
        if (!list.length) return;
        e.preventDefault();
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span className="ans-dd" ref={box}>
      <button ref={trigger} type="button" className="btn xs" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label} <IcChevD size={12} />
      </button>
      {open && (
        <div className="ans-menu" role="menu" aria-label={label}>
          {children(() => {
            setOpen(false);
            trigger.current?.focus();
          })}
        </div>
      )}
    </span>
  );
}

/** 경고·정보 부족·한계 — T3Q 문구 그대로(제자리). id 를 주면 「경고·정보 부족 보기」 바로가기 대상 */
export function RawFoot({ raw, id }: { raw: NonNullable<JobFull["raw"]>; id?: string }) {
  const lim = raw.result?.limitations ?? [];
  if (!raw.warnings?.length && !raw.data_gaps?.length && !lim.length) return null;
  return (
    <div className="gaps" id={id} tabIndex={id ? -1 : undefined}>
      {raw.warnings?.map((w, i) => <div key={`w${i}`}>· {w.message}</div>)}
      {raw.data_gaps?.map((g, i) => <div key={`g${i}`}>· 정보 부족: {gapName(g.component)} — {GAP_KO[g.reason] ?? g.reason}</div>)}
      {lim.map((l, i) => <div key={`l${i}`}>· {l}</div>)}
    </div>
  );
}

function Feedback({ jobId }: { jobId: string }) {
  const s = useSession();
  const [r, setR] = useState<"GOOD" | "BAD" | null>(null);
  const [ask, setAsk] = useState(false);
  const [comment, setComment] = useState("");
  const send = (rating: "GOOD" | "BAD", c?: string) =>
    api("/api/t3q/feedback", { method: "POST", json: { jobId, rating, comment: c } })
      .then(() => {
        setR(rating);
        setAsk(false);
        s.toast("평가를 보냈습니다.");
      })
      .catch((e) => s.toast((e as Error).message));
  return (
    <span className="fb">
      <span className="xs muted">이 답변이 도움이 됐나요?</span>
      <button className={`btn xs ${r === "GOOD" ? "on" : ""}`} onClick={() => send("GOOD")}>도움이 됐어요</button>
      <button className={`btn xs ${r === "BAD" ? "on" : ""}`} onClick={() => setAsk(true)}>아쉬워요</button>
      {ask && (
        <span className="fb-ask">
          <input value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="아쉬운 점(선택)" />
          <button className="btn xs primary" onClick={() => send("BAD", comment)}>보내기</button>
        </span>
      )}
    </span>
  );
}
