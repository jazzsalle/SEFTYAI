import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Account } from "../config";
import { newRequestId, t3q } from "../t3q/client";
import { wxCovers, wxTargetOfT3q, type WxTarget } from "../wxMatch";
import { db, ensureSchema } from "./db";
import { fetchLiveAdvisories } from "./kma";
import { traceAdd } from "./kvStore";

/**
 * 질의 작업 (R1·R2·R8·R22) — T3Q Agent ASYNC 를 Neon 작업 표로 감싼다.
 * - 접수: 캐시(24h) 적중 → 즉시 완료 작업 / 같은 키 진행 중 → 합류 / 슬롯(계정 4·전체 8) 있으면 T3Q 제출, 없으면 QUEUED
 * - 재사용 기간(D5)은 원래 답을 받은 시각 기준 24h — 접수 때 그 지역에 기상특보가 발효 중이면 1h(특보 조회 실패면 24h 그대로).
 *   재사용 작업은 원래 답을 받은 시각(source_finished_at)·그때 발효 중이던 특보(source_wx_seen)를 함께 준다
 * - 답을 받으면(DONE) 그때 발효 중인 기상청 특보 목록을 wx_seen 에 남긴다(C9·D5 「답변을 받은 뒤 특보」를 특보 발표 시각이 아니라 목록으로 가리려고)
 * - 슬롯 입장은 한 트랜잭션(advisory lock) 안에서 세고 차지한다 — 병렬 브리핑도 한도를 넘지 않는다
 * - 상태 조회(lazy 폴링): 진행 중 호출이 있으면 기다리고(배타적 폴링 권리), 없으면 T3Q 결과 조회 1회
 * - 모든 상태 전이는 "지금 상태"를 조건으로 건다(늦게 온 응답이 끝난 작업을 되살리지 않게)
 * - raw·preview·geo 는 T3Q 원응답 그대로 저장한다(R0). 여기서 답을 고치거나 다시 쓰는 코드는 두지 않는다.
 * 2026-10-28 독립 검토(37건) 반영.
 */
export type JobState = "QUEUED" | "SUBMITTED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED" | "LOST" | "TIMEOUT";
export type JobSource = "USER" | "BRIEFING" | "QUICK" | "SUGGEST" | "LIBRARY" | "FOLLOW_UP" | "AI_MODE";

export interface Job {
  id: string;
  account_id: string;
  conv_id: string | null;
  turn_no: number | null;
  t3q_request_id: string | null;
  t3q_conversation_id: string | null;
  source: JobSource;
  library_id: string | null;
  question_user: string;
  question_sent: string;
  request: Record<string, unknown>;
  cache_key: string;
  state: JobState;
  t3q_status: string | null;
  http_status: number | null;
  raw: unknown;
  preview: unknown;
  geo: unknown;
  cached_from: string | null;
  retry_of: string | null;
  retries: number;
  error_code: string | null;
  created_at: string;
  submitted_at: string | null;
  last_polled_at: string | null;
  finished_at: string | null;
  elapsed_ms: number | null;
  /** C9·D5 — 답을 받은 때(DONE 으로 끝낼 때) 발효 중이던 기상청 특보(해제 제외). null = 모름(조회 실패·지연, 열을 만들기 전 작업, 재사용 사본) */
  wx_seen: WxSeen[] | null;
  /** 재사용(cached_from)이면 원래 답을 받은 시각 = 원본 작업의 finished_at(D5), 재사용이 아니면 null. DB 열이 아니라 읽을 때 붙인다 */
  source_finished_at?: string | null;
  /** 재사용이면 원래 답을 받은 때의 특보(원본 작업의 wx_seen), 재사용이 아니면 null. DB 열이 아니라 읽을 때 붙인다 */
  source_wx_seen?: WxSeen[] | null;
}

/** 답을 받은 때 발효 중이던 특보 하나 — 기상청 특보 현황에서 받은 값 그대로(화면 lib/jobTypes.ts 와 같은 모양) */
export interface WxSeen {
  id: string;
  type: string;
  level: string;
  regionId: string | null;
}
/** 재사용이 아닌 작업의 원본 정보 */
const NO_SOURCE = { source_finished_at: null, source_wx_seen: null } as const;

const ACTIVE: JobState[] = ["QUEUED", "SUBMITTED", "RUNNING"];
const PER_ACCOUNT = 4;
const GLOBAL = () => Number(process.env.T3Q_MAX_GLOBAL || 8);
const POLL_THROTTLE_MS = 2500;
const POLL_TIMEOUT_MS = 8000;
const SUBMIT_TIMEOUT_MS = 12000;
const HARD_TIMEOUT_MS = 15 * 60_000;
const QUEUE_MAX_MS = 15 * 60_000;
const LOST_RETRY_WINDOW_MS = 90_000;
const CANCEL_COOLDOWN_MS = 120_000;
const CACHE_TTL_MS = 24 * 3600_000;
/** D5 — 그 지역에 기상특보가 발효 중이면 1시간 안에 받은 답만 다시 쓴다 */
const WARN_CACHE_TTL_MS = 3600_000;
/** 특보 조회 — /api/weather 와 같은 60초 캐시. 접수 때 기다리는 상한(넘으면 조회 실패와 같게 24시간 기준) */
const WX_CACHE_MS = 60_000;
const WX_WAIT_MS = 3000;
const ADMIT_LOCK = 424201;

const T3Q_SOURCE: Record<JobSource, string> = {
  USER: "USER", BRIEFING: "BRIEFING", QUICK: "QUICK", SUGGEST: "SUGGEST", LIBRARY: "SUGGEST", FOLLOW_UP: "FOLLOW_UP", AI_MODE: "AI_MODE",
};
const T3Q_ROLE: Record<Account["role"], string> = { 지자체: "LOCAL_GOV_OFFICER", 중앙정부: "CENTRAL_GOV_OFFICER", 운영자: "SYSTEM_OPERATOR" };

const canon = (v: unknown): string =>
  JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const pseudo = (id: string) => "U-" + createHmac("sha256", process.env.SESSION_SECRET || "dev").update(id).digest("hex").slice(0, 12);

export interface SubmitInput {
  question: string;
  source: JobSource;
  libraryId?: string | null;
  convId?: string | null;
  turnNo?: number | null;
  queryContext?: Record<string, unknown> | null;
  weatherWarnings?: Record<string, unknown> | null;
  reference?: Record<string, unknown> | null;
  briefing?: Record<string, unknown> | null;
  quickQueryId?: string | null;
  aiMode?: Record<string, unknown> | null;
  /** 이어서 묻기 — 이전 작업 + 고른 참조 대상(R4) */
  followUp?: { jobId: string; refs?: { display_name?: string | null; entity_type?: string | null }[] } | null;
  noCache?: boolean;
  /** 자동 조회 데이터(R3) — 라우트가 미리 받아 둔 Data API 원응답 */
  preview?: unknown;
}

/** R4 — 이어서 묻기 접두(고정 템플릿, 이전 답 본문은 넣지 않는다) */
export function followUpQuestion(prevQuestion: string, refs: { display_name?: string | null; entity_type?: string | null }[], q: string) {
  const lines = [`[이전 질문] ${prevQuestion}`];
  for (const r of refs) if (r.display_name) lines.push(`[참조 대상] ${r.display_name}${r.entity_type ? `(${r.entity_type})` : ""}`);
  lines.push(`[후속 질문] ${q}`);
  return lines.join("\n");
}

async function q<T = Job>(text: string, params: unknown[] = []) {
  await ensureSchema();
  return (await db().query(text, params)) as T[];
}

export async function submitJob(acc: Account, input: SubmitInput): Promise<Job> {
  let questionSent = input.question.trim();
  let t3qConv: string | null = null;
  let reference = input.reference ?? null;
  if (input.followUp) {
    const [prev] = await q("select * from sa_agent_jobs where id = $1 and account_id = $2", [input.followUp.jobId, acc.id]);
    if (prev) {
      questionSent = followUpQuestion(prev.question_user, input.followUp.refs ?? [], questionSent);
      t3qConv = prev.t3q_conversation_id;
      if (input.followUp.refs?.length) reference = { ...(reference ?? {}), refs: input.followUp.refs };
    }
  }
  const request: Record<string, unknown> = {
    caller: { user_id: pseudo(acc.id), role: T3Q_ROLE[acc.role], org_admin_code: (input.queryContext?.region as { admin_code?: string })?.admin_code ?? null },
    conversation_id: t3qConv,
    turn_no: input.turnNo ?? 1,
    question: questionSent,
    question_source: T3Q_SOURCE[input.source],
    query_context: input.queryContext ?? null,
    reference,
    response_mode: "ASYNC",
    ...(input.briefing ? { briefing: input.briefing } : {}),
    ...(input.quickQueryId ? { quick_query_id: input.quickQueryId } : {}),
    ...(input.aiMode ? { ai_mode: input.aiMode } : {}),
    ...(input.weatherWarnings ? { weather_warnings: input.weatherWarnings } : {}),
  };
  // AI 모드 정기 점검은 10분 단위로 새로 묻는다(R6)
  const bucket = input.source === "AI_MODE" ? Math.floor(Date.now() / 600_000) : null;
  const cacheKey = createHash("sha256")
    .update([questionSent, request.question_source, canon(request.query_context), canon(warnKeys(input.weatherWarnings)), canon(reference), t3qConv ?? "", bucket ?? ""].join("‖"))
    .digest("hex");

  const id = randomUUID();
  const base = [id, acc.id, input.convId ?? null, input.turnNo ?? null, input.source, input.libraryId ?? null, input.question.trim(), questionSent, JSON.stringify(request), cacheKey];

  if (!input.noCache) {
    // 원래 받은 답(재사용 사본이 아닌 행)만 찾는다 — 사본의 시각으로 재사용 기간이 이어서 늘어나지 않게
    let hit: Job | undefined = (
      await q(
        `select * from sa_agent_jobs where cache_key = $1 and cached_from is null and state = 'DONE' and t3q_status in ('SUCCESS','PARTIAL_SUCCESS') and finished_at > $2 order by finished_at desc limit 1`,
        [cacheKey, new Date(Date.now() - CACHE_TTL_MS)],
      )
    )[0];
    // D5 — 1시간보다 오래된 답이면 그 기준지역 특보 발효 여부를 본다(발효 중이면 다시 쓰지 않음)
    if (hit && Date.now() - new Date(hit.finished_at ?? 0).getTime() > WARN_CACHE_TTL_MS && (await warningInEffect(wxTargetOfT3q(input.queryContext?.region)))) hit = undefined;
    if (hit) {
      const [row] = await q(
        `insert into sa_agent_jobs (id, account_id, conv_id, turn_no, source, library_id, question_user, question_sent, request, cache_key,
           state, t3q_status, http_status, raw, preview, geo, cached_from, t3q_conversation_id, finished_at, elapsed_ms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DONE',$11,$12,$13,$14,$15,$16,$17,now(),0) returning *`,
        [...base, hit.t3q_status, hit.http_status, JSON.stringify(hit.raw), JSON.stringify(input.preview ?? hit.preview), hit.geo == null ? null : JSON.stringify(hit.geo), hit.id, hit.t3q_conversation_id],
      );
      return { ...row, source_finished_at: hit.finished_at, source_wx_seen: hit.wx_seen ?? null };
    }
    const [running] = await q(`select * from sa_agent_jobs where cache_key = $1 and account_id = $2 and state in ('QUEUED','SUBMITTED','RUNNING') limit 1`, [cacheKey, acc.id]);
    if (running) return { ...running, ...NO_SOURCE };
  }

  const [row] = await q(
    `insert into sa_agent_jobs (id, account_id, conv_id, turn_no, source, library_id, question_user, question_sent, request, cache_key, state, preview)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUEUED',$11) returning *`,
    [...base, input.preview === undefined ? null : JSON.stringify(input.preview)],
  );
  return { ...((await dispatch(row)) ?? row), ...NO_SOURCE };
}

const warnKeys = (w?: Record<string, unknown> | null) =>
  ((w?.items as { warning_key?: string; kind?: string; level?: string; area?: string }[]) ?? []).map((i) => [i.warning_key, i.kind, i.level, i.area]);

type LiveWeather = Awaited<ReturnType<typeof fetchLiveAdvisories>>;
let wxCache: { at: number; p: Promise<LiveWeather | null> } | null = null;

/** 기상청 특보 현황 — /api/weather 와 같은 조회(kma.ts)·같은 60초 캐시. 실패하거나 WX_WAIT_MS 안에 오지 않으면 null */
async function liveWeather(): Promise<LiveWeather | null> {
  if (!wxCache || Date.now() - wxCache.at > WX_CACHE_MS) wxCache = { at: Date.now(), p: fetchLiveAdvisories().catch(() => null) };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((res) => {
    timer = setTimeout(() => res(null), WX_WAIT_MS);
  });
  try {
    return await Promise.race([wxCache.p, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * D5 — 접수 시각에 작업의 기준지역(보낸 query_context.region)에 기상특보가 발효 중인가(발효·변경 — 예비·해제는 아님).
 * 지역 맞추기는 화면(특보 줄·AI 모드)과 같은 함수 lib/wxMatch.wxCovers: 지역을 보내지 않았으면(전국) 모든 특보, 아니면 특보 구역이 기준지역을 덮는 것.
 * 조회 실패·지연·지역 이름을 읽을 수 없음(undefined) → false(24시간 기준 그대로)
 */
async function warningInEffect(target: WxTarget | null | undefined): Promise<boolean> {
  if (target === undefined) return false;
  const w = await liveWeather();
  if (!w?.ok) return false;
  return w.advisories.some((a) => (a.status === "발효" || a.status === "변경") && wxCovers(a.area, target));
}

/**
 * C9·D5 — 지금(답을 받은 때) 발효 중인 특보(해제 제외) — 기상청 특보 현황에서 받은 값 그대로, 지역을 가리지 않고 전부.
 * 조회 실패·지연(WX_WAIT_MS)이면 null(모름) — 화면은 모르면 「받은 뒤 특보」를 보이지 않는다
 */
async function wxSnapshot(): Promise<WxSeen[] | null> {
  const w = await liveWeather();
  if (!w?.ok) return null;
  return w.advisories.filter((a) => a.status !== "해제").map((a) => ({ id: a.id, type: a.type, level: a.level, regionId: a.regionId ?? null }));
}

/** 재사용 작업에 원래 답을 받은 시각·그때의 특보(원본 작업의 finished_at·wx_seen)를 붙인다 — 재사용이 아니면 null, 한 번의 조회로 */
async function withSource(rows: Job[]): Promise<Job[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.cached_from ? [r.cached_from] : [])))];
  const src = new Map<string, { finished_at: string | null; wx_seen: WxSeen[] | null }>();
  if (ids.length)
    for (const s of await q<{ id: string; finished_at: string | null; wx_seen: WxSeen[] | null }>("select id, finished_at, wx_seen from sa_agent_jobs where id = any($1::text[])", [ids]))
      src.set(s.id, s);
  return rows.map((r) => {
    const s = r.cached_from ? src.get(r.cached_from) : undefined;
    return { ...r, source_finished_at: s?.finished_at ?? null, source_wx_seen: s?.wx_seen ?? null };
  });
}
const withSource1 = async (job: Job) => (await withSource([job]))[0];

/**
 * 슬롯이 있으면 T3Q 에 제출. 입장(슬롯 세기)과 차지(QUEUED→SUBMITTED)를 advisory lock 트랜잭션 한 번에 — 병렬 요청도 한도를 지킨다.
 * POST 가 끝날 때까지 폴링이 끼어들지 않도록 last_polled_at 을 제출 상한만큼 앞당겨 둔다.
 */
async function dispatch(job: Job): Promise<Job | null> {
  if (job.state !== "QUEUED") return job;
  await ensureSchema();
  const sql = db();
  const [, rows] = (await sql.transaction([
    sql.query("select pg_advisory_xact_lock($1)", [ADMIT_LOCK]),
    sql.query(
      `update sa_agent_jobs set state = 'SUBMITTED', submitted_at = now(), last_polled_at = now() + interval '30 seconds', t3q_request_id = $2
        where id = $1 and state = 'QUEUED'
          and (select count(*) from sa_agent_jobs where account_id = $3 and state in ('SUBMITTED','RUNNING')) < $4
          and (select count(*) from sa_agent_jobs where state in ('SUBMITTED','RUNNING'))
            + (select count(*) from sa_agent_jobs where state = 'CANCELLED' and submitted_at is not null and finished_at > $5) < $6
        returning *`,
      [job.id, newRequestId(), job.account_id, PER_ACCOUNT, new Date(Date.now() - CANCEL_COOLDOWN_MS), GLOBAL()],
    ),
  ])) as unknown as [unknown, Job[]];
  const claimed = rows[0];
  if (!claimed) return null;
  let r = await t3q<{ status?: string }>("POST", "/agent/query", claimed.request, { requestId: claimed.t3q_request_id!, timeoutMs: SUBMIT_TIMEOUT_MS });
  if (r.http === 0) {
    await new Promise((res) => setTimeout(res, 1000));
    r = await t3q("POST", "/agent/query", claimed.request, { requestId: claimed.t3q_request_id!, timeoutMs: SUBMIT_TIMEOUT_MS });
  }
  if (r.http === 202) {
    const [u] = await q(`update sa_agent_jobs set state = 'RUNNING', last_polled_at = now() where id = $1 and state = 'SUBMITTED' returning *`, [job.id]);
    return u ?? (await q("select * from sa_agent_jobs where id = $1", [job.id]))[0] ?? claimed;
  }
  // 202 가 아니면 그 응답이 곧 결과(오류 봉투 포함) — 그대로 저장, 추적로그에도 남긴다
  const done = await finish(job.id, r.envelope && r.http === 200 ? "DONE" : "FAILED", {
    http: r.http, raw: r.body ?? undefined, status: (r.body as { status?: string } | null)?.status, error: r.envelope ? undefined : r.error ?? "SUBMIT_FAILED",
  });
  return done ?? claimed;
}

/** 상태 조회 — 필요하면 T3Q 를 한 번 폴링 (lazy) */
export async function getJob(acc: Account, id: string): Promise<Job | null> {
  const [job] = await q("select * from sa_agent_jobs where id = $1 and (account_id = $2 or $3)", [id, acc.id, acc.role === "운영자"]);
  if (!job) return null;
  const out = await advance(job);
  // 같은 계정의 대기열·방치 작업도 조금씩 진행(lazy sweep)
  sweep(acc.id, id).catch((e) => console.error("[jobs] sweep", e));
  return withSource1(out);
}

async function advance(job: Job): Promise<Job> {
  if (job.state === "QUEUED") {
    // 너무 오래 기다린 대기 작업은 끝낸다(슬롯이 계속 막혀 있는 경우)
    if (Date.now() - new Date(job.created_at).getTime() > QUEUE_MAX_MS) return (await finish(job.id, "TIMEOUT", { error: "QUEUE_TIMEOUT" })) ?? job;
    return (await dispatch(job)) ?? job;
  }
  if (job.state === "DONE") return retryGeo(job);
  if (job.state !== "RUNNING" && job.state !== "SUBMITTED") return job;
  // 배타적 폴링 권리 — 진행 중인 결과 조회가 있으면(last_polled_at 이 미래) 기다린다
  const [claimed] = await q(
    `update sa_agent_jobs set last_polled_at = now() + interval '${Math.ceil(POLL_TIMEOUT_MS / 1000)} seconds'
      where id = $1 and state in ('SUBMITTED','RUNNING') and (last_polled_at is null or last_polled_at < $2) returning *`,
    [job.id, new Date(Date.now() - POLL_THROTTLE_MS)],
  );
  if (!claimed) return job;
  const overdue = Date.now() - new Date(claimed.submitted_at ?? claimed.created_at).getTime() > HARD_TIMEOUT_MS;
  const r = await t3q<{ status?: string; conversation_id?: string; result?: { job_status?: string; refs?: unknown[] } }>("GET", `/agent/query/${claimed.t3q_request_id}`, undefined, { timeoutMs: POLL_TIMEOUT_MS });
  await q("update sa_agent_jobs set last_polled_at = now() where id = $1 and state in ('SUBMITTED','RUNNING')", [job.id]);
  // 아직 진행 중이거나 일시 장애 — 15분을 넘겼을 때만 취소·시간 초과(답이 이미 있으면 위에서 받았다)
  if (r.http === 202 || r.http === 0 || !r.envelope) {
    if (!overdue) return { ...claimed, last_polled_at: new Date().toISOString() };
    await t3q("POST", `/agent/query/${claimed.t3q_request_id}/cancel`, { reason: "TIMEOUT" }, { timeoutMs: POLL_TIMEOUT_MS });
    return (await finish(job.id, "TIMEOUT", { error: "TIMEOUT" })) ?? claimed;
  }
  const js = r.body?.result?.job_status;
  if (js === "NOT_FOUND") {
    // T3Q 가 작업을 잃었다(재시작 등). 90초 안이면 같은 작업 행을 다시 대기열에 — 화면이 같은 작업을 계속 따라간다
    if (Date.now() - new Date(claimed.created_at).getTime() < LOST_RETRY_WINDOW_MS && (claimed.retries ?? 0) < 1) {
      const [again] = await q(
        `update sa_agent_jobs set state = 'QUEUED', t3q_request_id = null, submitted_at = null, last_polled_at = null, retries = retries + 1, error_code = 'RESUBMITTED_AFTER_LOST'
          where id = $1 and state in ('SUBMITTED','RUNNING') returning *`,
        [job.id],
      );
      if (again) return (await dispatch(again)) ?? again;
    }
    return (await finish(job.id, "LOST", { http: r.http, raw: r.body, status: r.body?.status, error: "LOST" })) ?? claimed;
  }
  if (js === "CANCELLED") return (await finish(job.id, "CANCELLED", { http: r.http, raw: r.body, status: r.body?.status })) ?? claimed;
  const done = await finish(job.id, r.http === 200 ? "DONE" : "FAILED", { http: r.http, raw: r.body, status: r.body?.status, conv: r.body?.conversation_id });
  if (done?.state === "DONE") await prefetchGeo(done).catch((e) => console.error("[jobs] geo", e));
  return (await q("select * from sa_agent_jobs where id = $1", [job.id]))[0] ?? done ?? claimed;
}

/** 끝내기 — 아직 진행 중인 작업만(이미 끝난 작업을 늦은 응답이 덮지 않게). 바뀐 경우에만 추적로그. 답을 받았으면(DONE) 그때 발효 중인 특보도 남긴다 */
async function finish(id: string, state: JobState, o: { http?: number; raw?: unknown; status?: string; conv?: string; error?: string }) {
  const wx = state === "DONE" ? await wxSnapshot() : null;
  const u = await finishRow(id, state, o, wx);
  if (u)
    traceAdd({
      accountId: u.account_id, api: "에이전트 질의(ASYNC)", intent: u.source, status: u.t3q_status ?? u.state, ms: u.elapsed_ms ?? 0, q: u.question_sent,
      requestId: u.t3q_request_id ?? u.id, datasets: [`job:${u.id}`, ...(((u.raw as { result?: { refs?: unknown[] } } | null)?.result?.refs?.length ?? 0) ? [`refs:${(u.raw as { result: { refs: unknown[] } }).result.refs.length}`] : [])],
    }).catch(() => {});
  return u;
}

async function finishRow(id: string, state: JobState, o: { http?: number; raw?: unknown; status?: string; conv?: string; error?: string }, wx: WxSeen[] | null): Promise<Job | undefined> {
  const [u] = await q(
    `update sa_agent_jobs set state = $2, http_status = coalesce($3, http_status), raw = coalesce($4, raw), t3q_status = coalesce($5, t3q_status),
       t3q_conversation_id = coalesce($6, t3q_conversation_id), error_code = $7, finished_at = now(),
       elapsed_ms = least((extract(epoch from now() - created_at) * 1000)::int, coalesce($8::int, 2147483647)), wx_seen = $9::jsonb
     where id = $1 and state in ('QUEUED','SUBMITTED','RUNNING') returning *`,
    [id, state, o.http ?? null, o.raw === undefined ? null : JSON.stringify(o.raw), o.status ?? null, o.conv ?? null, o.error ?? null,
      state === "DONE" ? ((o.raw as { meta?: { elapsed_ms?: number } } | null)?.meta?.elapsed_ms ?? null) : null,
      wx === null ? null : JSON.stringify(wx)],
  );
  return u;
}

type RefRow = { ref: string; map?: { key?: string; value?: string } };
const refsOf = (job: Job) => ((job.raw as { result?: { refs?: RefRow[] } })?.result?.refs ?? []).filter((r) => r.map?.value);

/** 완료 답의 refs → EXT-01 도형 원문 저장(지도 즉시 표시용, 답 가공 아님) */
async function prefetchGeo(job: Job) {
  const refs = refsOf(job);
  if (!refs.length) return;
  const items = refs.slice(0, 300).map((r) => ({ ref: r.ref, key: r.map!.key, value: String(r.map!.value) }));
  const g = await t3q("POST", "/spatial-objects/geometry", { items }, { timeoutMs: POLL_TIMEOUT_MS });
  if (g.envelope) await q("update sa_agent_jobs set geo = $2 where id = $1", [job.id, JSON.stringify(g.body)]);
}

/** 도형 선조회가 실패했던 완료 작업 — 30초에 한 번까지 다시 시도(캐시로 복사된 작업 포함) */
async function retryGeo(job: Job): Promise<Job> {
  if (job.geo != null || !refsOf(job).length) return job;
  const [claimed] = await q(
    `update sa_agent_jobs set last_polled_at = now() where id = $1 and geo is null and (last_polled_at is null or last_polled_at < $2) returning *`,
    [job.id, new Date(Date.now() - 30_000)],
  );
  if (!claimed) return job;
  await prefetchGeo(claimed).catch((e) => console.error("[jobs] geo retry", e));
  return (await q("select * from sa_agent_jobs where id = $1", [job.id]))[0] ?? job;
}

async function sweep(accountId: string, skip: string) {
  const rows = await q(
    `select * from sa_agent_jobs where account_id = $1 and id <> $2 and state in ('QUEUED','RUNNING','SUBMITTED')
       and (last_polled_at is null or last_polled_at < $3) order by created_at limit 2`,
    [accountId, skip, new Date(Date.now() - 15_000)],
  );
  for (const r of rows) await advance(r);
}

/**
 * 아무 계정이든 방치된(60초 넘게 폴링 안 된) 진행 작업을 조금씩 진행 — 소유자가 화면을 닫아도 결과를 거두고 슬롯을 돌려준다(R22).
 * 함수 시간 한도 안에서 끝나도록 시간 예산(budgetMs)을 넘기면 멈춘다.
 */
export async function sweepAny(limit = 3, budgetMs = 6000) {
  const t0 = Date.now();
  const rows = await q(
    `select * from sa_agent_jobs where state in ('QUEUED','RUNNING','SUBMITTED') and (last_polled_at is null or last_polled_at < $1) order by created_at limit ${Math.max(1, Math.min(limit, 10))}`,
    [new Date(Date.now() - 60_000)],
  );
  let n = 0;
  for (const r of rows) {
    if (Date.now() - t0 > budgetMs) break;
    await advance(r).catch((e) => console.error("[jobs] sweepAny advance", r.id, e));
    n++;
  }
  return n;
}

export async function listJobs(acc: Account, o: { active?: boolean; limit?: number; all?: boolean } = {}) {
  const lim = Math.min(o.limit ?? 50, 200);
  if (o.all && acc.role === "운영자")
    return withSource(await q(`select * from sa_agent_jobs ${o.active ? "where state = any($1)" : "where $1::text[] is not null"} order by created_at desc limit ${lim}`, [ACTIVE]));
  return withSource(
    await q(
      `select * from sa_agent_jobs where account_id = $1 ${o.active ? "and state = any($2)" : "and $2::text[] is not null"} order by created_at desc limit ${lim}`,
      [acc.id, ACTIVE],
    ),
  );
}

export async function cancelJob(acc: Account, id: string) {
  const [job] = await q("select * from sa_agent_jobs where id = $1 and (account_id = $2 or $3)", [id, acc.id, acc.role === "운영자"]);
  if (!job) return null;
  if (!ACTIVE.includes(job.state)) return withSource1(job);
  if (job.t3q_request_id && job.state !== "QUEUED") await t3q("POST", `/agent/query/${job.t3q_request_id}/cancel`, { reason: "USER_CANCELLED" }, { timeoutMs: POLL_TIMEOUT_MS });
  const out = (await finish(id, "CANCELLED", { error: "USER_CANCELLED" })) ?? (await q("select * from sa_agent_jobs where id = $1", [id]))[0];
  return out ? withSource1(out) : null;
}

/**
 * 다시 질의 — 원래 보낸 요청(이어서 묻기 접두·특보·브리핑·빠른질의·대화 번호 포함)을 그대로 새 작업으로 보낸다(캐시 쓰지 않음).
 * 화면은 그 턴의 작업 ID 를 새 작업으로 바꾼다.
 */
export async function retryJob(acc: Account, id: string): Promise<Job | null> {
  const [old] = await q("select * from sa_agent_jobs where id = $1 and account_id = $2", [id, acc.id]);
  if (!old) return null;
  const [row] = await q(
    `insert into sa_agent_jobs (id, account_id, conv_id, turn_no, source, library_id, question_user, question_sent, request, cache_key, state, preview, retry_of)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUEUED',$11,$12) returning *`,
    [randomUUID(), old.account_id, old.conv_id, old.turn_no, old.source, old.library_id, old.question_user, old.question_sent, JSON.stringify(old.request), old.cache_key,
      old.preview == null ? null : JSON.stringify(old.preview), old.id],
  );
  return { ...((await dispatch(row)) ?? row), ...NO_SOURCE };
}

/** 예상 대기 — 최근 완료 20건 중앙값(ms) */
export async function medianMs(): Promise<number | null> {
  const rows = await q<{ elapsed_ms: number }>(
    `select elapsed_ms from sa_agent_jobs where state = 'DONE' and cached_from is null and elapsed_ms > 0 order by finished_at desc limit 20`,
  );
  if (!rows.length) return null;
  const v = rows.map((r) => r.elapsed_ms).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

/** 화면용 — 큰 열(request·raw·preview·geo)은 상세 조회 때만 */
export function jobSummary(j: Job) {
  const { raw, preview, geo, request, ...rest } = j;
  void raw; void preview; void geo; void request;
  return rest;
}

/** 자동 조회 데이터 원응답 저장(접수와 동시에 받아 온 것) — 돌려주는 작업에도 재사용 정보(source_finished_at)를 붙인다 */
export async function setPreview(id: string, preview: unknown) {
  const [u] = await q("update sa_agent_jobs set preview = $2 where id = $1 returning *", [id, JSON.stringify(preview)]);
  return u ? withSource1(u) : null;
}
