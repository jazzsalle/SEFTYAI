"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSession } from "@/lib/session";
import { isActive, receivedAt, type JobFull, type JobSummary, type T3qRef, type WxSeen } from "@/lib/jobTypes";
import { ANSWER_FAILED, BRIEF_FAILED, failureText, hideDbNames, isAnswerOk, mappable } from "@/lib/answerText";
import { fmtElapsed } from "@/lib/format";
import { activeAdvisories } from "@/lib/wxref";
import { legacyAdvIds, seenArea, wxCovers, wxTargetOfT3q, type WxTarget } from "@/lib/wxMatch";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import type { RefLike } from "@/lib/mapRef";
import { useExplore } from "../explore/ExploreCtx";
import { AnswerMarkdown, mdPlainText } from "./Markdown";
import { PrivacyNote } from "./PiiMask";
import { docRows } from "@/lib/docRefs";
import DocRefs from "./DocRefs";
import AnswerFeedback from "./AnswerFeedback";
import FollowUps from "./FollowUps";
import DemoInfoPanel, { hasDemoInfographic } from "./DemoInfographic";
import AutoInfoPanel from "./AutoInfographic";
import CompactSummary from "../summary/CompactSummary";
import SimilarSummary from "../summary/SimilarSummary";
import { wantsSimilarSummary, withDisasterType } from "@/lib/similarCases";
import { useSummary, type SummaryState } from "../summary/useSummary";
import { basisTime } from "@/lib/summary";
import "./answer.css";

export { entityLabel } from "./Markdown";

/**
 * 에이전트 답 카드 — 개발서버 AnswerPanel DoneAnswer·TurnAnswer 와 같은 모양·순서(2026-11-19 「개발서버와 동일하게」). 답 글은 개발서버와 같은 화면 처리(lib/answerText).
 * 진행 중: 기다리는 한 줄(글·경과·단계·취소) + 흐르는 글 칸 /
 * 완료: 머리(아이콘 · 재난안전 AI · 「YYYY.MM.DD HH:mm 기준」 · 도구: 접기·답변 대상·답변 복사) → (시연 그림) → 한눈 요약 → 유사사례 요약 → 답 글 →
 * [전체 보기 ▼] → 근거 문서 → 답변 대상 N곳 → 「대상지역 N건」 → 경고 → 평가(response_id 있을 때만) → 이어서 물어보기.
 * 받지 못한 답(실패·성공 아닌 응답)은 정해 둔 문구 한 덩이와 [다시 시도](개발서버 answer-error) — 기술 사유는 내지 않는다.
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
/** 진행 중 경과 — 개발서버 AnswerPanel formatElapsed 그대로(「45초」·「1분 5초」, 지난 초만 · 내림) */
const fmtWaiting = (ms: number) => fmtElapsed(Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) * 1000 : 0);

/** 흐르는 글에는 답변 대상 이름을 잇지 않는다(개발서버) */
const NO_REFS: T3qRef[] = [];

/**
 * 답 카드가 서기 전 기다리는 한 줄(보내는 중·불러오는 중) — 진행 중과 같은 모양(개발서버 answer-running · briefing-item-wait), 취소 단추는 없다(작업 번호를 아직 모른다)
 */
export function AnswerWait({ text, since, brief }: { text: string; since?: string; brief?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  const from = since ? Date.parse(since) : NaN;
  const clock = Number.isFinite(from) ? <> <strong>{fmtWaiting(now - from)}</strong></> : null;
  if (brief)
    return (
      <p className="briefing-item-wait" aria-busy="true">
        <span className="answer-spinner" aria-hidden="true" />
        {text}
        {clock}
      </p>
    );
  return (
    <div className="answer-running" aria-busy="true">
      <span className="answer-spinner" aria-hidden="true" />
      <p>{text}{clock}</p>
    </div>
  );
}

/** noActions — 브리핑 항목 카드처럼 머리에 취소·다시 시도 단추가 따로 있는 자리에서는 카드 안 단추를 뺀다 · brief — 브리핑 항목(받지 못한 답 문구가 대화창과 다르다) */
type CardProps = { job: JobSummary; full: JobFull | undefined; compact?: boolean; noActions?: boolean; brief?: boolean };

/** 작업이 바뀌면(다시 질의·새로 받기) 카드 상태를 새로 시작한다 */
export default function AnswerCard(props: CardProps) {
  return <Card key={props.job.id} {...props} />;
}

/** 이 길이를 넘는 답은 접을 수 있다(개발서버 FoldAt — 2,500자) */
const FOLD_AT = 2500;

/** 「답변 대상」 한 줄 — 한눈 요약의 분류(급경사지·지하차도 …)로 묶은 대상(개발서버 AnswerTools TargetRow) */
interface TargetRow { key: string; name: string; kind: string; ref?: RefLike }

/** 한눈 요약의 분류로 대상을 묶는다 — 요약이 아직이면 빈 목록(개발서버 useAnswerTargets) */
function targetsOf(sm: SummaryState): { rows: TargetRow[]; kinds: string[] } {
  if (sm.kind !== "ok") return { rows: [], kinds: [] };
  const rows: TargetRow[] = [];
  for (const g of sm.summary.groups) for (const r of g.rows) rows.push({ key: r.id, name: r.name, kind: g.short, ref: r.ref });
  for (const r of sm.summary.others) rows.push({ key: r.id, name: r.name, kind: "기타", ref: r.ref });
  return { rows, kinds: [...new Set(rows.map((r) => r.kind))] };
}

/**
 * 받지 못한 답 — 개발서버 answer-error(설계 슬라이드 42): 머리 없이 알럿 한 덩이와 [다시 시도].
 * onRetry 가 없으면(브리핑 항목 · 다시 연 대화의 턴) 단추를 두지 않는다
 */
export function AnswerError({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="answer-error" role="alert">
      <p className="answer-error-text">{text}</p>
      {onRetry && <button type="button" className="answer-retry" onClick={onRetry}>다시 시도</button>}
    </div>
  );
}

function Card({ job, full, compact, noActions, brief }: CardProps) {
  const s = useSession();
  const x = useExplore();
  const raw = full?.raw ?? null;
  const res = raw?.result ?? null;
  const refs = useMemo(() => (res?.refs ?? []) as T3qRef[], [res]);
  const active = isActive(job.state);
  const [now, setNow] = useState(() => Date.now());
  const [folded, setFolded] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const at = receivedAt(job, full);
  // 한눈 요약(개발 서버 시안 1) — 같은 refs 는 한 번만 받는다(CompactSummary 와 같은 캐시). 답변 대상 상자의 갈래도 이것으로(개발서버 useAnswerTargets)
  const sm = useSummary(brief ? null : refs);
  const targets = useMemo(() => targetsOf(sm), [sm]);
  const regionName = (full?.request as { query_context?: { region?: { name?: string } | null } } | undefined)?.query_context?.region?.name ?? null;
  // 유사사례 한눈 요약(개발서버 AnswerPanel caseCtx) — 사례를 물은 답이면 그 답을 보낸 조건(+ 질문에서 읽은 재난유형)으로 T3Q-04 를 부른다
  const similarCtx = useMemo(() => {
    const text = typeof res?.answer === "string" ? res.answer : "";
    if (brief || !text || !wantsSimilarSummary(job.question_user, text)) return null;
    const qc = (full?.request as { query_context?: Record<string, unknown> | null } | undefined)?.query_context;
    return qc && typeof qc === "object" ? withDisasterType(qc, job.question_user) : null;
  }, [brief, res, job.question_user, full?.request]);

  // 진행 중은 1초마다(경과 시계)
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (active) {
    const ms = now - new Date(job.created_at).getTime();
    const lv = s.live?.[job.id];
    const partial = lv?.text ?? "";
    const cancel = () => s.cancel(job.id).catch(() => s.toast("취소하지 못했습니다."));
    /*
      진행 중 모양 — 개발서버 BriefingItemCard·AnswerPanel(b818af0) 글자·순서 그대로. 머리줄·상태 딱지·점선 카드 없이 기다리는 한 줄 + 흐르는 글 칸.
      흐르는 글은 받은 글 조각 그대로(답변 대상 이름 연결 없음 — 개발서버 AnswerText 에 refs 를 주지 않는다). 끝나면 저장된 원응답으로 완성 답 카드가 이 자리를 대신한다
    */
    if (brief)
      return (
        <>
          <p className="briefing-item-wait" aria-busy="true">
            <span className="answer-spinner" aria-hidden="true" />
            확인하고 있습니다… <strong>{fmtWaiting(ms)}</strong>
            {/* 한 건이 1~5분 — 그만두는 것은 이 항목 하나(개발서버 briefing-cancel, 줄 안) */}
            {!partial && lv?.stage ? <span className="answer-stage"> · {lv.stage}</span> : null}
            <button type="button" className="briefing-cancel" onClick={cancel}>취소</button>
          </p>
          {partial && (
            <div className="briefing-item-streaming" aria-live="polite">
              <AnswerMarkdown text={partial} refs={NO_REFS} />
            </div>
          )}
        </>
      );
    return (
      <>
        <div className="answer-running" aria-busy="true">
          <span className="answer-spinner" aria-hidden="true" />
          <p>
            {partial ? "답변을 작성하고 있습니다…" : "답변을 만들고 있습니다…"} <strong>{fmtWaiting(ms)}</strong>
            {!partial && lv?.stage ? <span className="answer-stage"> · {lv.stage}</span> : null}
          </p>
          {/* 실제로 25~100초가 걸린다. 기다리다 그만둘 수 있어야 한다 */}
          {!noActions && <button type="button" className="answer-cancel" onClick={cancel}>취소</button>}
        </div>
        {partial && (
          <article className="acard answer-streaming" aria-live="polite">
            <AnswerMarkdown text={partial} refs={NO_REFS} />
          </article>
        )}
      </>
    );
  }

  // 다시 시도 — 브리핑 항목(머리에 따로 있음)·다시 연 대화의 턴(개발서버: 되살린 턴은 보낼 재료가 없어 단추를 두지 않는다)에는 없다
  const retry = noActions || endedBefore(job.finished_at) ? undefined : () => x.retry(job.id);
  // 완료됐지만 원응답을 아직 못 받은 경우 — 실패가 아니라 불러오는 중
  if (job.state === "DONE" && !raw) return <AnswerWait text="답변을 불러오는 중…" brief={brief} />;
  // 정해 둔 문구만(개발서버와 같은 문장) — 서버가 준 사유·경고 글은 기술 용어가 섞여 내지 않는다
  if (job.state !== "DONE" || !raw) return <AnswerError text={failureText(job.state, endedBefore(job.finished_at))} onRetry={retry} />;
  // 성공이 아닌 응답(일부 제공 등)·답 글이 없는 응답 — 답 글을 그리지 않고 안내 문구만(개발서버 useConversation·useBriefing isSuccess · TurnAnswer)
  const answer = typeof res?.answer === "string" && res.answer ? res.answer : null;
  if (!isAnswerOk(raw.status) || !answer) return <AnswerError text={brief ? BRIEF_FAILED : ANSWER_FAILED} onRetry={retry} />;

  const refsId = `refs-${job.id}`;
  const activeRef = x.selectedKey?.startsWith(job.id + ":") ? x.selectedKey.slice(job.id.length + 1) : null;
  // 근거 문서(doc_refs) — 번호(doc)가 있는 것만 화면 안 「근거 문서」 패널로 연다
  const docList = docRows(res?.doc_refs, answer).filter((r) => r.doc);
  const docIds = docList.map((r) => r.doc as string);
  const activeDoc = x.activeEvidence?.jobId === job.id ? x.activeEvidence.doc : null;
  const basis = basisTime(at ?? job.created_at);
  const onMap = refs.filter(mappable).length;

  // 갈래를 고르면 「답변 대상」 상자로 내려가 그 갈래만 보인다(개발서버 pickKind)
  const pickKind = (k: string | null) => {
    setKind(k);
    const el = document.getElementById(refsId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  };

  return (
    <article className="acard ans">
      <header className="acard-h">
        {/* AI 아이콘은 장식 — 낭독하지 않는다 */}
        <span className="acard-icon" aria-hidden="true"><SparkIcon /></span>
        <b>재난안전 AI</b>
        {/* 답변 기준시각 — 받아 둔 답이면 그 답을 처음 받은 시각(개발서버 basisTime(cachedAt ?? askedAt)) */}
        {basis && <span className="acard-at">{basis} 기준</span>}
        <AnswerTools
          long={!compact && answer.length > FOLD_AT}
          folded={folded}
          onFold={() => setFolded((v) => !v)}
          kinds={targets.kinds}
          kind={kind}
          onKind={pickKind}
          bodyRef={bodyRef}
          markdown={hideDbNames(answer)}
        />
      </header>

      {/* 그림을 먼저(11/2 행안부 회의 코멘트, 사용자 승인 2026-11-02) — 시연 탭 항목은 미리 만든 시연 자료, 그 밖은 받은 대상·조회 값으로 그린 답변 그림. 답 글·대상은 그대로 */}
      {hasDemoInfographic(job) ? <DemoInfoPanel job={job} /> : <AutoInfoPanel job={job} full={full} noTargets={sm.kind !== "none"} />}
      {/* 한눈 요약(시안 1 압축형) — 대상이 먼저, 답 글은 그 아래(개발서버 CompactSummary) */}
      {!brief && <CompactSummary refs={refs} regionName={regionName} basisAt={basis} onEntity={(r) => x.openEntity(job.id, r)} onExpand={() => x.showSummary(job.id)} />}
      {/* 유사사례 답 — refs 가 없어 위 요약이 안 붙는다. 순위·1위 사건·답에 나온 수치(개발서버 SimilarSummary). 사건을 누르면 사건 상세 탭 */}
      {similarCtx && <SimilarSummary ctx={similarCtx} answer={answer} regionName={regionName} onEvent={(ev) => x.openDetail("T3Q-10", ev.id, ev.label, ev.ctx)} />}

      {/* 개인정보 가림 안내 — T3Q 가 *** 로 가려 보낸 곳 수(없으면 그리지 않음) */}
      <PrivacyNote text={answer} />
      <div ref={bodyRef} className={folded ? "answer-body is-folded" : "answer-body"}>
        <AnswerMarkdown
          text={answer}
          refs={refs}
          activeRef={activeRef}
          onRef={(r) => x.openEntity(job.id, r)}
          docs={docIds}
          activeDoc={activeDoc}
          onDoc={(d) => {
            const row = docList.find((r) => r.doc === d);
            if (row) x.openEvidence(job.id, row, docList);
          }}
        />
      </div>
      {folded && <button type="button" className="ans-lnk" onClick={() => setFolded(false)}>전체 보기 ▼</button>}
      {/* 근거 문서(T3Q v0.4.5 doc_refs — 개발서버 DocRefs) — 문서 이름 · 쪽, 누르면 원문 미리보기 새 창. 비면 답 글 안 문서 링크로 */}
      <DocRefs refs={res?.doc_refs} text={answer} jobId={job.id} activeDoc={activeDoc} onOpen={(row, rows, view) => x.openEvidence(job.id, row, rows, view)} />

      <AnswerTargets id={refsId} rows={targets.rows} kinds={targets.kinds} kind={kind} onKind={setKind} onEntity={(r) => x.openEntity(job.id, r)} />

      {/* 지도에 보일 수 있는 것만 센다(개발서버 mappableRefs) — 하나도 없으면 줄을 내지 않는다 */}
      {onMap > 0 && (
        <p className="answer-note"><strong>대상지역</strong> {onMap}건</p>
      )}
      {/* 경고 — T3Q 문구 그대로. 정보 부족(data_gaps)·한계(limitations)는 내지 않는다(개발서버 AnswerPanel, 사용자 지시 2026-11-03) */}
      {!!raw.warnings?.length && (
        <ul className="answer-warnings">
          {raw.warnings.map((w, i) => <li key={`w${i}`}>{w.message}</li>)}
        </ul>
      )}
      {/* 답변 평가(T3Q-31) — response_id 가 없는 답은 상류가 가리킬 데가 없어 자리를 내지 않는다(개발서버) */}
      {!!res?.response_id && <AnswerFeedback jobId={job.id} />}
      {/* 이어서 물어보기 — 추천 후속질문(개발서버 AnswerPanel · FUN-UFR-301003, R62). 브리핑 항목 카드에는 없다(개발서버 브리핑 결과에 onFollowUp 없음) */}
      {!brief && <FollowUps list={res?.follow_up_questions} onAsk={x.askSuggested} />}
    </article>
  );
}

/** 머리 줄 도구 — 접기 · 답변 대상 · 답변 복사(개발서버 AnswerTools). 복사 결과는 툴바 안에 2초(토스트 아님) */
function AnswerTools({ long, folded, onFold, kinds, kind, onKind, bodyRef, markdown }: {
  long: boolean;
  folded: boolean;
  onFold: () => void;
  kinds: string[];
  kind: string | null;
  onKind: (kind: string | null) => void;
  bodyRef: RefObject<HTMLDivElement | null>;
  markdown: string;
}) {
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (done === null) return;
    const t = setTimeout(() => setDone(null), 2000);
    return () => clearTimeout(t);
  }, [done]);
  const copy = (text: string, msg: string) => {
    if (!navigator.clipboard) return setDone("복사하지 못했습니다");
    navigator.clipboard.writeText(text).then(
      () => setDone(msg),
      () => setDone("복사하지 못했습니다"),
    );
  };
  const copyPlain = () => {
    const md = bodyRef.current?.querySelector(".md");
    if (md) copy(mdPlainText(md), "서식 없는 글로 복사했습니다");
  };
  return (
    <div className="ans-tools" role="toolbar" aria-label="답변 도구">
      {done && <span className="ans-done" role="status">{done}</span>}
      {long && <button type="button" className="ans-lnk" onClick={onFold}>{folded ? "전체 보기" : "접기"}</button>}
      {kinds.length > 0 && (
        <Menu label="답변 대상">
          {(close) => (
            <>
              <button type="button" role="menuitemradio" aria-checked={kind === null} onClick={() => { close(); onKind(null); }}>전체</button>
              {kinds.map((k) => (
                <button key={k} type="button" role="menuitemradio" aria-checked={kind === k} onClick={() => { close(); onKind(k); }}>{k}</button>
              ))}
            </>
          )}
        </Menu>
      )}
      <Menu label="답변 복사">
        {(close) => (
          <>
            <button type="button" role="menuitem" onClick={() => { close(); copyPlain(); }}>서식 없는 글</button>
            <button type="button" role="menuitem" onClick={() => { close(); copy(markdown, "마크다운 원문을 복사했습니다"); }}>마크다운 원문</button>
          </>
        )}
      </Menu>
    </div>
  );
}

/** 「답변 대상」 상자 — 갈래 칩으로 거르고, 이름을 누르면 상세(지도)로 간다(개발서버 AnswerTargets) */
function AnswerTargets({ id, rows, kinds, kind, onKind, onEntity }: {
  id: string;
  rows: TargetRow[];
  kinds: string[];
  kind: string | null;
  onKind: (kind: string | null) => void;
  onEntity: (ref: RefLike) => void;
}) {
  if (rows.length === 0) return null;
  const shown = kind === null ? rows : rows.filter((r) => r.kind === kind);
  return (
    <section className="ans-refbox" id={id} tabIndex={-1} aria-label="답변 대상">
      <div className="ans-refbox-h">
        <b>답변 대상</b>
        <span className="ans-refbox-n">{shown.length}곳</span>
      </div>
      {kinds.length > 1 && (
        <div className="ans-filter" role="group" aria-label="답변 대상 갈래">
          <button type="button" className="ans-fchip" aria-pressed={kind === null} onClick={() => onKind(null)}>전체</button>
          {kinds.map((k) => (
            <button key={k} type="button" className="ans-fchip" aria-pressed={kind === k} onClick={() => onKind(k)}>{k}</button>
          ))}
        </div>
      )}
      <ul className="ans-reflist">
        {shown.map((r) => (
          <li key={r.key}>
            {r.ref ? (
              <button type="button" className="ans-lnk" onClick={() => onEntity(r.ref as RefLike)}>{r.name}</button>
            ) : (
              <span>{r.name}</span>
            )}
            <span className="ans-refkind">{r.kind}</span>
            {r.ref && <button type="button" className="ans-lnk ans-lnk--xs" onClick={() => onEntity(r.ref as RefLike)}>상세 보기</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 머리 줄 펼침 메뉴 — 바깥을 누르거나 Esc 면 닫힌다(개발서버 AnswerTools Menu) */
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
      <button ref={trigger} type="button" className="ans-dd-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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

/** AI 표시 — 개발서버 SparkIcon(18, 채운 별) */
function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 2 9.4 6.2 13.6 7.6 9.4 9 8 13.2 6.6 9 2.4 7.6 6.6 6.2z" fill="currentColor" />
    </svg>
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
