"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { isActive, receivedAt, STATE_LABEL, type JobFull, type JobSummary, type T3qRef, type WxSeen } from "@/lib/jobTypes";
import { ANSWER_FAILED, BRIEF_FAILED, failureText, isAnswerOk } from "@/lib/answerText";
import { fmtAgo, fmtElapsed, fmtRunning } from "@/lib/format";
import { activeAdvisories, advLabel, advTime } from "@/lib/wxref";
import { legacyAdvIds, seenArea, wxCovers, wxTargetOfT3q, type WxTarget } from "@/lib/wxMatch";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import { SCN_SENT_LABEL, sentWithScenario } from "@/lib/scenario";
import { useExplore } from "../explore/ExploreCtx";
import { IcChevD } from "../Icons";
import { AnswerMarkdown, entityLabel, mdPlainText } from "./Markdown";
import DocRefs from "./DocRefs";
import DemoInfoPanel, { hasDemoInfographic } from "./DemoInfographic";
import AutoInfoPanel from "./AutoInfographic";
import CompactSummary from "../summary/CompactSummary";
import SimilarSummary from "../summary/SimilarSummary";
import { wantsSimilarSummary, withDisasterType } from "@/lib/similarCases";
import { useSummary } from "../summary/useSummary";
import { basisTime } from "@/lib/summary";
import "./answer.css";

export { entityLabel } from "./Markdown";

/**
 * 에이전트 답 카드 (Figma 203001 · 시각 설계 08 C·D — 적용 범위 R25) — 답 글은 개발서버와 같은 화면 처리를 거쳐 그린다(lib/answerText, 사용자 결정 2026-11-06).
 * 진행 중: 경과 시계(「1분 45초째」)·취소 / 완료: 머리(처리 시간 = 제공처 meta.elapsed_ms · 도구: 답변 대상 거르기·답변 복사) ·
 * 주의(재사용 D5 · 받은 뒤 특보 C9 · 경고 바로가기 — 있을 때만) · 마크다운 · 답변 대상(refs 순서 그대로, 종류 거르기 C3) ·
 * 경고(제자리, 문구 그대로 — 정보 부족·한계는 개발서버처럼 내지 않음) · 원문 보기·복사(C10, 받은 글 그대로) · 평가 · 이어서 묻기.
 * 받지 못한 답은 정해 둔 안내 문구만(개발서버 agentRun describe — 기술 사유는 내지 않음).
 * 응답 상태가 SUCCESS 가 아니면(일부 제공·결과 없음 등) 답 글이 와도 받지 못한 답으로 — 안내 문구 · 다시 질의 · 원문 보기·마크다운 원문 복사(받은 그대로)만(개발서버 isSuccess, 2026-11-06).
 * 유엔이가 센 값·설명 문구는 두지 않는다.
 */

/**
 * 이 답을 보낸 기준지역 — 요청 query_context.region(이름·단계, 서버 재사용 기준 D5 와 같은 함수 lib/wxMatch).
 * 지역을 보내지 않았으면 전국(null), 요청이 없거나 지역 이름을 읽을 수 없으면 undefined(모름)
 */
export function regionOfRequest(request: unknown): WxTarget | null | undefined {
  if (!request || typeof request !== "object") return undefined;
  const qc = (request as { query_context?: { region?: unknown } | null }).query_context;
  return wxTargetOfT3q(qc?.region);
}

/** 이 답을 받은 때 발효 중이던 특보(서버가 남긴 목록) — 재사용이면 원래 답을 받은 때의 것. 모르면 null */
export function seenAdvisories(job: JobSummary, full?: JobFull | null): WxSeen[] | null {
  if (job.cached_from) return job.source_wx_seen ?? full?.source_wx_seen ?? null;
  return job.wx_seen ?? full?.wx_seen ?? null;
}

/**
 * 답을 받은 뒤 그 지역에 새로 발표된 특보(받은 순서 그대로) — 답을 받은 때 발효 중이던 특보 목록(seen)에 없고,
 * 기상청 발표 시각도 받은 시각(at) 뒤인 것만. 특보 현황의 발표 시각(issuedAt)은 특보마다의 시각이 아니라 현황 한 장의 시각이라
 * 그것만으로는 가리지 않는다(다른 지역 특보가 새로 나와도 시각이 바뀐다). 기준지역이면 그 기준지역을 덮는 같은 종류·단계 특보가
 * 그때 있었는지(구역 글은 특보 id 에서, 예전 시험 자료처럼 id 꼴이 다르면 시범 지역 표시로), 전국이면 같은 특보(구역 포함)가 있었는지로 본다.
 * 무엇이든 모르면(특보 조회 실패·목록 없음·시각 없음·지역 모름) 빈 목록 — 주의를 지어내지 않는다
 */
export function advisoriesAfter(weather: WeatherResponse | null | undefined, target: WxTarget | null | undefined, at: string | null, seen: WxSeen[] | null | undefined): Advisory[] {
  if (!weather?.status.ok || target === undefined || !at || !seen) return [];
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return [];
  const ids = new Set(seen.map((w) => w.id));
  const known = (a: Advisory) => {
    // 전환용(임시) — 예전 판이 괄호 안 괄호 구역을 쪼개 남긴 wx_seen: 같은 구역 글의 예전 id 가 모두 있으면 그때도 발효 중이던 같은 특보
    const old = legacyAdvIds(a.type, a.level, a.area);
    if (old.length > 1 && old.every((id) => ids.has(id))) return true;
    return seen.some((w) => {
      if (!target) return w.id === a.id;
      if (w.type !== a.type || w.level !== a.level) return false;
      const area = seenArea(w);
      return area !== null ? wxCovers(area, target) : !!w.regionId && w.regionId === a.regionId;
    });
  };
  // 시연 시나리오 특보(R43)는 보지 않는다 — 재사용 기준 D5·답을 받은 때 특보(wx_seen)처럼 기상청 실시간만
  return activeAdvisories(weather, target).filter((a) => {
    if (a.scenario) return false;
    const i = Date.parse(a.issuedAt);
    return Number.isFinite(i) && i > t && !known(a);
  });
}

/** 이 화면을 연 때 — 그 전에 끝난 작업은 다시 연 대화의 턴으로 본다(실패 문구 「답변을 받지 못한 질문입니다.」) */
const PAGE_OPENED = Date.now();
const endedBefore = (at: string | null | undefined) => !!at && Date.parse(at) < PAGE_OPENED;
const p2 = (n: number) => String(n).padStart(2, "0");
/** 앱 시각 → 「2026-10-28 02:48」(이 컴퓨터 시간대). 읽지 못하면 받은 글자 그대로 */
export function fmtYmdHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
const advText = (a: Advisory) => `${a.area} ${advLabel(a)} ${advTime(a.issuedAt)}`;
/** 「이전 답변 재사용」 띠·머리의 처리 시간 — 끔(사용자 지시 2026-11-02 — 시연) */
const SHOW_REUSE = false;

/** noActions — 브리핑 항목 카드처럼 머리에 취소·다시 시도 단추가 따로 있는 자리에서는 카드 안 단추를 뺀다 · brief — 브리핑 항목(받지 못한 답 문구가 대화창과 다르다) */
type CardProps = { job: JobSummary; full: JobFull | undefined; compact?: boolean; noActions?: boolean; brief?: boolean };

/** 작업이 바뀌면(다시 질의·새로 받기) 카드 상태를 새로 시작한다 */
export default function AnswerCard(props: CardProps) {
  return <Card key={props.job.id} {...props} />;
}

function Card({ job, full, compact, noActions, brief }: CardProps) {
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
  // 한눈 요약(개발 서버 시안 1) — 같은 refs 는 한 번만 받는다(CompactSummary 와 같은 캐시)
  const sm = useSummary(brief ? null : refs);
  const regionName = (full?.request as { query_context?: { region?: { name?: string } | null } } | undefined)?.query_context?.region?.name ?? null;
  // 유사사례 한눈 요약(개발서버 AnswerPanel caseCtx) — 사례를 물은 답이면 그 답을 보낸 조건(+ 질문에서 읽은 재난유형)으로 T3Q-04 를 부른다
  const similarCtx = useMemo(() => {
    const text = typeof res?.answer === "string" ? res.answer : "";
    if (brief || !text || !wantsSimilarSummary(job.question_user, text)) return null;
    const qc = (full?.request as { query_context?: Record<string, unknown> | null } | undefined)?.query_context;
    return qc && typeof qc === "object" ? withDisasterType(qc, job.question_user) : null;
  }, [brief, res, job.question_user, full?.request]);
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
    const lv = s.live?.[job.id];
    return (
      <div className="acard loading" aria-busy="true">
        <div className="acard-h"><span className="ai-dot spin" /> <b>재난안전 AI</b> <span className="xs muted">{STATE_LABEL[job.state]}</span></div>
        <div className="s" style={{ marginTop: 8 }}>
          답변을 만드는 중입니다 · <b>{fmtRunning(ms)}</b>
          {lv?.stage && !lv.text && <span className="xs muted"> · {lv.stage}</span>}
        </div>
        {/* 스트리밍(T3Q v0.4) — 받은 글 조각 그대로. 끝나면 저장된 원응답(final)으로 바뀐다 */}
        {lv?.text && (
          <div className="acard-body" style={{ marginTop: 8 }}>
            <AnswerMarkdown text={lv.text} refs={lv.refs} />
          </div>
        )}
        {!noActions && <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => s.cancel(job.id).catch(() => s.toast("취소하지 못했습니다."))}>질의 취소</button>
        </div>}
      </div>
    );
  }

  // 완료됐지만 원응답을 아직 못 받은 경우 — 실패가 아니라 불러오는 중
  if (job.state === "DONE" && !raw) return <div className="acard loading" aria-busy="true"><span className="ai-dot spin" /> 답변을 불러오는 중…</div>;
  if (job.state !== "DONE" || !raw) {
    // 정해 둔 문구만(개발서버와 같은 문장) — 서버가 준 사유·경고 글은 기술 용어가 섞여 내지 않는다
    return (
      <div className="acard err">
        <div className="acard-h"><b>재난안전 AI</b> <span className="badge danger">{STATE_LABEL[job.state]}</span></div>
        <div className="s" style={{ marginTop: 8 }}>{failureText(job.state, endedBefore(job.finished_at))}</div>
        {!noActions && <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm pri" onClick={() => x.retry(job.id)}>다시 질의</button>
        </div>}
      </div>
    );
  }

  const answer = typeof res?.answer === "string" ? res.answer : null;
  const elapsed = raw.meta?.elapsed_ms;
  const hasNotice = !!raw.warnings?.length;
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

  // 성공이 아닌 응답(일부 제공 등) — 답 글을 그리지 않고 안내 문구만(개발서버 useConversation·useBriefing). 원문 보기·복사는 받은 그대로 남긴다
  if (!isAnswerOk(raw.status)) {
    return (
      <div className="acard err">
        <div className="acard-h"><b>재난안전 AI</b></div>
        <div className="s" style={{ marginTop: 8 }} role="alert">{brief ? BRIEF_FAILED : ANSWER_FAILED}</div>
        <div className="row" style={{ marginTop: 10 }}>
          {!noActions && <button className="btn sm pri" onClick={() => x.retry(job.id)}>다시 질의</button>}
          <button className="btn xs" onClick={() => setShowRaw((v) => !v)}>{showRaw ? "원문 닫기" : "원문 보기"}</button>
          {answer && <button className="btn xs" onClick={copyMd}>마크다운 원문 복사</button>}
        </div>
        {showRaw && <pre className="rawbox">{answer ?? JSON.stringify(raw, null, 2)}</pre>}
      </div>
    );
  }

  return (
    <div className="acard ans">
      <div className="acard-h">
        <span className="ai-dot" /> <b>재난안전 AI</b>
        <span className="xs muted">
          {[
            raw.meta?.base_time ? `${raw.meta.base_time} 기준` : null,
            SHOW_REUSE && typeof elapsed === "number" ? `처리 ${fmtElapsed(elapsed)}` : null,
            sentWithScenario(full?.request) ? SCN_SENT_LABEL : null,
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

      {/* 「이전 답변 재사용」 띠는 보이지 않는다(사용자 지시 2026-11-02 — 시연에서 보일 필요 없음). 받은 뒤 특보 주의 줄은 그대로 */}
      {SHOW_REUSE && reused && (
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
      {hasNotice && <button type="button" className="ans-jump" onClick={() => goTo(noticeId, "center")}>경고 보기 ↓</button>}

      {/* 그림을 먼저(11/2 행안부 회의 코멘트, 사용자 승인 2026-11-02) — 시연 탭 항목은 미리 만든 시연 자료, 그 밖은 받은 대상·조회 값으로 그린 답변 그림. 답 글·대상은 그대로 */}
      {hasDemoInfographic(job) ? <DemoInfoPanel job={job} /> : <AutoInfoPanel job={job} full={full} noTargets={sm.kind !== "none"} />}
      {/* 답 글 위 한눈 요약 카드(개발 서버 CompactSummary) — 대상 그림은 이 카드가 맡는다(답변 그림의 「답변 대상」은 접는다) */}
      {!brief && <CompactSummary refs={refs} regionName={regionName} basisAt={basisTime(at ?? job.created_at)} onEntity={(r) => x.openEntity(job.id, r)} onExpand={() => x.showSummary(job.id)} />}
      {/* 유사사례 답 — refs 가 없어 위 요약이 안 붙는다. 순위·1위 사건·답에 나온 수치(개발서버 SimilarSummary). 사건을 누르면 사건 상세 탭 */}
      {similarCtx && answer && <SimilarSummary ctx={similarCtx} answer={answer} regionName={regionName} onEvent={(ev) => x.openDetail("T3Q-10", ev.id, ev.label, ev.ctx)} />}

      {answer ? (
        <div ref={bodyRef} className={fold ? "acard-body folded" : "acard-body"}>
          <AnswerMarkdown text={answer} refs={refs} activeRef={activeRef} onRef={(r) => x.openEntity(job.id, r)} />
        </div>
      ) : (
        <div className="s muted" style={{ marginTop: 8 }}>{ANSWER_FAILED}</div>
      )}
      {fold && <button className="lnk s" onClick={() => setFold(false)}>전체 보기 ▼</button>}
      {/* 근거 문서(T3Q v0.4.5 doc_refs — 개발서버 DocRefs) — 문서 이름 · 쪽, 누르면 원문 미리보기 새 창. 비면 답 글 안 문서 링크로 */}
      <DocRefs refs={res?.doc_refs} text={answer} />

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
                <button className="lnk" onClick={() => x.openEntity(job.id, r)}>{r.display_name ?? r.ref}</button>
                <span className="xs muted">{entityLabel(r.entity_type)}</span>
                <span className="sp" />
                {/* 개발서버 AnswerTargets 「상세 보기」(ans-lnk--xs) — 이름과 같이 상세 탭을 만들고 지도로 */}
                <button className="lnk xs ref-detail" onClick={() => x.openEntity(job.id, r)}>상세 보기</button>
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

/**
 * 답 아래 경고 — T3Q 문구 그대로(제자리). id 를 주면 「경고 보기」 바로가기 대상.
 * 정보 부족(data_gaps)·한계(limitations)는 내지 않는다(개발서버 AnswerPanel, 사용자 지시 2026-11-03) — 거의 모든 답에 같은 줄
 * (「행동매뉴얼 — 원자료에 없음」·「유사사례는 예측·위험판단이 아닌 참고 정보」)이 붙어 읽히지 않고 자리만 차지한다. 원문 보기에는 남는다
 */
export function RawFoot({ raw, id }: { raw: NonNullable<JobFull["raw"]>; id?: string }) {
  if (!raw.warnings?.length) return null;
  return (
    <div className="gaps" id={id} tabIndex={id ? -1 : undefined}>
      {raw.warnings.map((w, i) => <div key={`w${i}`}>· {w.message}</div>)}
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
