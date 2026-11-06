import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Account } from "../config";
import type { Advisory, WeatherResponse } from "../contract/agent";
import { baseToT3q, type BaseWire } from "../baseRegion";
import { scenarioCuts } from "../scenario";
import { activeAdvisories, warningsPayload } from "../wxref";
import { wxTargetOfT3q } from "../wxMatch";
import {
  AIM_GUIDE_MAX, AIM_INTERVAL_MIN, AIM_MAX_AGE_MIN, AIM_NAMES, AIM_PROMPT_ID, AIM_Q, AIM_RETENTION_DAYS, AIM_GROUPS,
  aimGroupOf, aimSlotStart, aimSupported, code10,
  type AimGuide, type AimResponse, type AimView, type AimWarning,
} from "../aiMode";
import { db, ensureSchema } from "./db";
import { getJob, submitJob, type Job } from "./jobs";
import { scenarioGet } from "./scenario";
import { liveWeather, weatherFor } from "./weather";

/**
 * AI 모드 상황점검 — 개발서버 AiModeService(배경 회차 RunAsync · 사람별 CheckForUserAsync) · T3qAiModeAgent(특보별 질의)를 복제 (R52).
 *
 * 개발서버는 Hangfire 잡이 그룹마다 10분(5분 엇갈림) 회차를 건다. Vercel 에는 상시 작업이 없어 **회차 판단을 서버가 읽힐 때 한다**:
 * 화면(/api/ai-mode)·크론(/api/cron/agent-sweep, 설정 시)이 부르면 그 지역의 지금 회차(aimSlotStart)가 아직 없을 때 한 번만(유일 색인) 회차를 만든다.
 * 점검 질의는 질의 작업 표(sa_agent_jobs)에 시스템 계정 SYS-AIM-<지역코드>(역할 SYSTEM_OPERATOR — 개발서버 CheckOneAsync 와 같은 호출자) 명의로 넣고,
 * 읽힐 때마다 진행시킨다(R1 lazy 폴링). 사람이 보지 않는 동안에는 회차가 서지 않는다 — 다음에 열 때 그 회차를 바로 돈다.
 *
 * 기록 = sa_aim_checks(첫 사용 때 만든다). account_id 가 비면 배경(지역 공용), 있으면 그 사람의 점검.
 */
type CheckRow = {
  id: string;
  check_id: string;
  admin_code: string;
  region_name: string;
  account_id: string | null;
  slot: string | null;
  trigger: string;
  sig: string;
  status: "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  warnings: AimWarning[] | null;
  jobs: { warningKey: string | null; jobId: string }[] | null;
  guides: AimGuide[] | null;
  no_warning_message: string | null;
  collect_status: string | null;
  requested_at: string;
  checked_at: string | null;
};

/** 질의 작업이 돌 수 있는 최대 시간(질의 작업 15분) + 여유 — 넘긴 RUNNING 회차는 실패로 닫는다(다음 회차를 막지 않게) */
const RUNNING_MAX_MS = 16 * 60_000;

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await ensureSchema();
    const sql = db();
    await sql.query(`create table if not exists sa_aim_checks (
      id text primary key, check_id text not null, admin_code text not null, region_name text not null, account_id text,
      slot timestamptz, trigger text not null, sig text not null, status text not null,
      warnings jsonb, jobs jsonb, guides jsonb, no_warning_message text, collect_status text,
      requested_at timestamptz not null default now(), checked_at timestamptz)`);
    // 배경 회차는 지역·회차마다 하나(여러 화면·서버가 함께 불러도 한 번)
    await sql.query(`create unique index if not exists sa_aim_checks_slot on sa_aim_checks (admin_code, slot) where slot is not null`);
    // 같은 지역(배경)·같은 사람 점검은 한 번에 하나 — 앞 점검이 돌고 있으면 그 회차는 건너뛴다(개발서버 DisableConcurrentExecution)
    await sql.query(`create unique index if not exists sa_aim_checks_run on sa_aim_checks (admin_code, coalesce(account_id, '')) where status = 'RUNNING'`);
    await sql.query(`create index if not exists sa_aim_checks_last on sa_aim_checks (admin_code, account_id, status, checked_at desc)`);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function q<T = CheckRow>(text: string, params: unknown[] = []) {
  await ensureTable();
  return (await db().query(text, params)) as T[];
}

/** 점검 질의를 거는 시스템 계정 — 사용자 질의 통계와 섞이지 않게(SYSTEM_OPERATOR). 계정당 동시 4 = 특보별 질의 동시 4 */
export const aimAccount = (adminCode: string): Account => ({
  id: `SYS-AIM-${adminCode}`, name: "AI 모드 점검", org: "시스템", dept: "AI 모드", role: "운영자", roleLabel: "시스템", region: "national", color: "#575d66", initial: "AI",
});

/** 특보 서명 — 발효 특보 번호를 정렬해 묶은 해시(개발서버 WarningLedger.Signature) */
export function aimSignature(advs: Pick<Advisory, "id">[]): string {
  return createHash("sha256").update(advs.map((a) => a.id).sort().join("\n")).digest("hex");
}

/** 기준 시각에 보낼 특보 — 해제는 보내지 않는다(WarningChange). 변경은 그대로, 새로 뜬 것은 신규 */
const changeOf = (a: Advisory) => (a.isNew ? "신규" : a.status === "변경" ? "변경" : null);
const warningOf = (a: Advisory): AimWarning => ({
  warningKey: a.id, kind: a.type, level: a.level, areaName: a.area, effectiveDe: a.issuedAt ?? null, changeType: changeOf(a), ...(a.scenario ? { scenario: true } : {}),
});

const iso = (d: Date) => {
  // +09:00 을 붙인 한국 시각 — 개발서버 Iso
  const k = new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 19);
  return `${k}+09:00`;
};
const checkId = () => `AIM-${iso(new Date()).slice(0, 10).replace(/-/g, "")}-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;

/** 묵었는가 — 마지막으로 답을 받은 때부터 60분(AiMode:MaxAgeMin) */
const isStale = (last: CheckRow, now: number) => Date.parse(last.checked_at ?? last.requested_at) + AIM_MAX_AGE_MIN * 60_000 <= now;

/** 점검 하나를 건다 — 발효 특보마다 따로(동시 4는 시스템 계정 동시 한도가 맡는다), 없으면 한 번 */
async function startCheck(row: { admin_code: string; region_name: string; account_id: string | null; slot: number | null; trigger: string; sig: string },
  base: BaseWire, weather: WeatherResponse, advs: Advisory[]): Promise<CheckRow | null> {
  const id = randomUUID();
  const cid = checkId();
  const warnings = advs.map(warningOf);
  const [made] = await q(
    `insert into sa_aim_checks (id, check_id, admin_code, region_name, account_id, slot, trigger, sig, status, warnings, collect_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'RUNNING',$9::jsonb,$10) on conflict do nothing returning *`,
    [id, cid, row.admin_code, row.region_name, row.account_id, row.slot === null ? null : new Date(row.slot), row.trigger, row.sig, JSON.stringify(warnings), weather.status.ok ? "SUCCESS" : "FAILED"],
  );
  if (!made) return null; // 다른 화면이 먼저 이 회차를 걸었거나 앞 점검이 아직 돈다
  const acc = aimAccount(row.admin_code);
  const region = baseToT3q(base);
  const many = advs.length > 1;
  const one = async (adv: Advisory | null, i: number) => {
    const job = await submitJob(acc, {
      question: AIM_Q,
      source: "AI_MODE",
      noCache: true,
      // 개발서버 Build — 기준 시각·지역, 특보는 그 하나만(없으면 빈 목록 — 「특보 없음」 점검)
      queryContext: { reference_time: iso(new Date()), region },
      aiMode: { check_id: many ? `${cid}-${i + 1}` : cid, trigger: row.trigger, interval_min: AIM_INTERVAL_MIN, prompt_id: AIM_PROMPT_ID },
      weatherWarnings: warningsPayload(weather, adv ? [adv] : []),
    });
    return { warningKey: adv?.id ?? null, jobId: job.id };
  };
  const jobs = advs.length ? await Promise.all(advs.map((a, i) => one(a, i))) : [await one(null, 0)];
  const [u] = await q("update sa_aim_checks set jobs = $2::jsonb where id = $1 returning *", [id, JSON.stringify(jobs)]);
  return u ?? made;
}

const ok = (j: Job | null) => !!j && j.state === "DONE" && j.t3q_status === "SUCCESS";
const answerOf = (j: Job | null) => (j?.raw as { result?: { answer?: unknown } } | null)?.result?.answer;
const noWarnOf = (j: Job | null) => (j?.raw as { result?: { no_warning_message?: unknown } } | null)?.result?.no_warning_message;

/**
 * 도는 점검을 한 걸음 진행 — 질의 작업을 하나씩 당기고(lazy 폴링), 모두 끝났으면 닫는다.
 * 받은 특보 것만 안내로 남고(일부 실패), 모두 실패해야 점검 실패다(T3qAiModeAgent). 안내 = 그 특보 질의의 답 글(앞뒤 공백만 걷고 500자까지)
 */
async function advanceCheck(c: CheckRow, now = Date.now()): Promise<CheckRow> {
  if (c.status !== "RUNNING") return c;
  const acc = aimAccount(c.admin_code);
  const list = c.jobs ?? [];
  const expected = Math.max(1, (c.warnings ?? []).length);
  const got = await Promise.all(list.map(async (x) => ({ ...x, job: await getJob(acc, x.jobId).catch(() => null) })));
  const allDone = list.length >= expected && got.every((x) => x.job && !["QUEUED", "SUBMITTED", "RUNNING"].includes(x.job.state));
  if (!allDone) {
    if (now - Date.parse(c.requested_at) < RUNNING_MAX_MS) return c;
    const [u] = await q("update sa_aim_checks set status = 'FAILED', checked_at = now() where id = $1 and status = 'RUNNING' returning *", [c.id]);
    return u ?? c;
  }
  const good = got.filter((x) => ok(x.job));
  const warnings = c.warnings ?? [];
  const guides: AimGuide[] = good
    .filter((x) => x.warningKey && typeof answerOf(x.job) === "string" && String(answerOf(x.job)).trim())
    .map((x, n) => {
      const w = warnings.find((v) => v.warningKey === x.warningKey);
      return { sortNo: n, warningKey: x.warningKey!, kind: w?.kind ?? "", level: w?.level ?? "", areaName: w?.areaName ?? "", message: String(answerOf(x.job)).trim().slice(0, AIM_GUIDE_MAX) };
    });
  const noWarn = good.map((x) => noWarnOf(x.job)).find((v) => typeof v === "string" && v) as string | undefined;
  const [u] = await q(
    `update sa_aim_checks set status = $2, guides = $3::jsonb, no_warning_message = $4, checked_at = now() where id = $1 and status = 'RUNNING' returning *`,
    [c.id, good.length ? "DONE" : "FAILED", JSON.stringify(guides), noWarn ? noWarn.slice(0, 500) : null],
  );
  return u ?? (await q("select * from sa_aim_checks where id = $1", [c.id]))[0] ?? c;
}

const viewOf = (c: CheckRow | undefined | null): AimView | null =>
  c
    ? {
        checkId: c.check_id, adminCode: c.admin_code, regionName: c.region_name, triggerType: c.trigger, status: c.status === "DONE" ? "DONE" : "FAILED",
        noWarningMessage: c.no_warning_message, guides: c.guides ?? [], warnings: c.warnings ?? [], collectStatus: c.collect_status,
        checkedDe: c.checked_at, lastCheckDe: c.checked_at,
        nextCheckDe: c.checked_at ? new Date(Date.parse(c.checked_at) + AIM_INTERVAL_MIN * 60_000).toISOString() : null,
      }
    : null;

const accCond = (account: string | null) => (account === null ? "account_id is null" : "account_id = $2");
const accArgs = (code: string, account: string | null) => (account === null ? [code] : [code, account]);

async function lastDone(code: string, account: string | null) {
  return (await q(`select * from sa_aim_checks where admin_code = $1 and ${accCond(account)} and status = 'DONE' order by checked_at desc limit 1`, accArgs(code, account)))[0];
}
async function running(code: string, account: string | null) {
  return (await q(`select * from sa_aim_checks where admin_code = $1 and ${accCond(account)} and status = 'RUNNING' limit 1`, accArgs(code, account)))[0];
}

/** 지역에 걸린 특보 — 해제 제외, 특보 구역이 기준지역을 덮는 것만(화면 특보 줄과 같은 lib/wxMatch) */
function advsFor(weather: WeatherResponse, base: BaseWire): Advisory[] {
  const target = wxTargetOfT3q(baseToT3q(base));
  return target === undefined ? [] : activeAdvisories(weather, target);
}

/** 무엇 때문에 묻는가 — 처음 · 특보 바뀜 · 묵음(주기) · 묻지 않음(null) */
function triggerOf(last: CheckRow | undefined, sig: string, now: number): string | null {
  if (!last) return "FIRST";
  if (last.sig !== sig) return "WARNING_CHANGED";
  return isStale(last, now) ? "SCHEDULED" : null;
}

/**
 * 배경 지역 회차 — 지금 회차가 아직 없으면 만든다(개발서버 RunAsync 의 한 지역 몫). 특보가 그대로이고 답이 젊으면 SKIPPED 줄만 남긴다
 */
async function tickManaged(base: BaseWire, code: string, now = Date.now()) {
  const group = aimGroupOf(code);
  if (group < 0) return;
  const slot = aimSlotStart(group, now);
  const [have] = await q<{ n: number }>("select count(*)::int as n from sa_aim_checks where admin_code = $1 and slot = $2", [code, new Date(slot)]);
  if (have?.n) return;
  const weather = await liveWeather();
  const advs = advsFor(weather, base);
  const sig = aimSignature(advs);
  const trigger = triggerOf(await lastDone(code, null), sig, now);
  if (trigger === null) {
    await q(
      `insert into sa_aim_checks (id, check_id, admin_code, region_name, account_id, slot, trigger, sig, status, collect_status, checked_at)
       values ($1,$2,$3,$4,null,$5,'SCHEDULED',$6,'SKIPPED',$7, now()) on conflict do nothing`,
      [randomUUID(), checkId(), code, AIM_NAMES[code] ?? base.name, new Date(slot), sig, weather.status.ok ? "SUCCESS" : "FAILED"],
    );
    return;
  }
  await startCheck({ admin_code: code, region_name: AIM_NAMES[code] ?? base.name, account_id: null, slot, trigger, sig }, base, weather, advs);
}

let purgedAt = 0;
async function purge() {
  if (Date.now() - purgedAt < 3_600_000) return;
  purgedAt = Date.now();
  await q(`delete from sa_aim_checks where requested_at < now() - interval '${AIM_RETENTION_DAYS} days' and status <> 'RUNNING'`).catch(() => {});
}

/**
 * 화면이 읽을 때(GET /api/ai-mode) — 배경 지역이면 회차를 판단·진행하고 지역 공용 최근 점검을, 아니면 그 사람의 최근 점검을 준다(상류를 새로 부르지 않음).
 * 시연 시나리오로 기상청 실시간이 끊긴 계정(R45)은 시나리오 특보로 묻도록 늘 사람별 점검
 */
export async function aimLatest(acc: Account, base: BaseWire | null): Promise<AimResponse> {
  if (!base || !aimSupported(base)) return { supported: false, managed: false, running: false, view: null };
  const code = code10(base.code);
  const managed = aimGroupOf(code) >= 0 && !scenarioCuts(await scenarioGet(), acc.id);
  const owner = managed ? null : acc.id;
  purge().catch(() => {});
  let run = await running(code, owner);
  if (run) run = await advanceCheck(run);
  if (managed) {
    await tickManaged(base, code);
    run = await running(code, null);
    return { supported: true, managed, running: !!run, view: viewOf(await lastDone(code, null)) };
  }
  // 사람별 점검 — 마지막으로 끝난 점검(실패 포함 — 개발서버 CheckForUserAsync 가 돌려주는 것)
  const last = (await q(`select * from sa_aim_checks where admin_code = $1 and account_id = $2 and status in ('DONE','FAILED') order by checked_at desc limit 1`, [code, acc.id]))[0];
  return { supported: true, managed, running: !!run && run.status === "RUNNING", view: viewOf(last) };
}

/**
 * 점검 한 번(POST /api/ai-mode/check) — 켜 둔 화면이 켤 때·10분마다 부른다. 배경 지역이면 읽기만(서버가 막는다 — 개발서버 IsManaged).
 * 특보 서명이 그대로이고 답이 60분보다 젊으면 상류를 부르지 않고 앞 점검을 준다
 */
export async function aimCheck(acc: Account, base: BaseWire | null, now = Date.now()): Promise<AimResponse> {
  const r = await aimLatest(acc, base);
  if (!r.supported || r.managed || r.running || !base) return r;
  const code = code10(base.code);
  const weather = await weatherFor(acc);
  const advs = advsFor(weather, base);
  const sig = aimSignature(advs);
  const trigger = triggerOf(await lastDone(code, acc.id), sig, now);
  if (trigger === null) return r;
  const started = await startCheck({ admin_code: code, region_name: base.name, account_id: acc.id, slot: null, trigger, sig }, base, weather, advs);
  return { ...r, running: !!started || r.running };
}

/** 크론 — 배경 지역 전부의 회차를 판단·진행(Vercel Cron 을 켠 경우) */
export async function aimTickAll(): Promise<number> {
  let n = 0;
  for (const g of AIM_GROUPS)
    for (const code of g.codes) {
      const run = await running(code, null);
      if (run) await advanceCheck(run);
      const short = code.endsWith("00000000") ? code.slice(0, 2) : code.slice(0, 5);
      await tickManaged({ code: short, name: AIM_NAMES[code] ?? short, level: short.length === 2 ? "SIDO" : "SIGUNGU" }, code);
      n++;
    }
  return n;
}
