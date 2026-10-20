import "server-only";
import { createHash } from "crypto";
import {
  CH_LABEL, DUP_WINDOW_SEC, LMS_MAX, reachable, resolveRecipients, smsBytes,
  type Channel, type Dispatch, type DispatchRequest, type SendStatus,
} from "../contactsCore";
import type { Account } from "../config";
import { audit, db, ensureSchema } from "./db";
import { getBundle } from "./contactsStore";
import { MOCK_RESULT_SEC, provider, RESULT_TIMEOUT_SEC } from "./messaging";

type Row = Record<string, unknown>;

export class DispatchError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/**
 * 상황전파 발송 (UFR-009-001-01)
 *  · 수신자는 서버가 연락망에서 다시 계산 (화면이 보낸 명단을 믿지 않음)
 *  · 중복 발송 차단: ① 같은 [전파] 요청(idemKey)은 한 번만 처리 → 두 번 눌러도 기존 발송을 돌려줌
 *                    ② 같은 내용·대상·채널을 DUP_WINDOW_SEC 안에 다시 보내면 409 — 사용자가 확인(force)해야 보냄
 *                    두 요청이 동시에 와도 기관+내용 잠금(advisory lock)으로 한쪽만 들어감
 */
export async function createDispatch(req: DispatchRequest, who: Account): Promise<{ dispatch: Dispatch; duplicate: boolean }> {
  await ensureSchema();
  const message = (req.message ?? "").trim();
  const channels = (["SMS", "EMAIL"] as Channel[]).filter((c) => (req.channels ?? []).includes(c)); // 문자 → 이메일 순
  if (!message) throw new DispatchError(400, "전파 내용을 입력하세요.");
  if (!channels.length) throw new DispatchError(400, "발송 방법을 고르세요.");
  if (channels.includes("SMS") && smsBytes(message) > LMS_MAX) throw new DispatchError(400, `문자는 ${LMS_MAX}바이트까지 보낼 수 있습니다.`);
  if (!req.idemKey || req.idemKey.length > 80) throw new DispatchError(400, "요청 키가 없습니다.");
  const sel = { groupIds: req.sel?.groupIds ?? [], unitIds: req.sel?.unitIds ?? [], contactIds: req.sel?.contactIds ?? [] };

  const sql = db();
  // ① 같은 요청을 다시 받음 → 기존 발송 그대로
  const again = (await sql.query("select id from sa_dispatches where idem_key = $1", [req.idemKey])) as Row[];
  if (again.length) return { dispatch: (await getDispatch(again[0].id as string))!, duplicate: true };

  const b = await getBundle(req.orgId);
  const rec = resolveRecipients(b, sel);
  const reach = rec.filter((r) => channels.some((c) => reachable(r, c)));
  if (!reach.length) throw new DispatchError(400, "고른 발송 방법으로 연락할 수 있는 대상이 없습니다.");

  const fingerprint = createHash("sha256").update([req.orgId, channels.join(","), message, rec.map((r) => r.id).sort().join(",")].join("\u0001")).digest("hex");
  const id = `D${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const p = provider();
  const [, ins] = await sql.transaction([
    sql.query("select pg_advisory_xact_lock(hashtext($1))", [`${req.orgId}:${fingerprint}`]),
    sql.query(
      `insert into sa_dispatches (id, org_id, by_name, by_id, channels, message, context, sel, resend_of, idem_key, fingerprint, provider)
       select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       where $13::boolean or not exists (select 1 from sa_dispatches where fingerprint = $11 and at > now() - make_interval(secs => $14::int))
       on conflict (idem_key) do nothing
       returning id`,
      [id, req.orgId, who.name, who.id, JSON.stringify(channels), message, req.context ?? null, JSON.stringify(sel), req.resendOf ?? null, req.idemKey, fingerprint, p.name, !!req.force, DUP_WINDOW_SEC],
    ),
  ]);
  if (!(ins as Row[]).length) {
    const same = (await sql.query("select id from sa_dispatches where idem_key = $1", [req.idemKey])) as Row[];
    if (same.length) return { dispatch: (await getDispatch(same[0].id as string))!, duplicate: true };
    const prev = (await sql.query("select id, at, by_name from sa_dispatches where fingerprint = $1 order by at desc limit 1", [fingerprint])) as Row[];
    const sec = prev.length ? Math.round((Date.now() - new Date(prev[0].at as string).getTime()) / 1000) : 0;
    throw new DispatchError(409, `같은 내용을 같은 대상에게 ${sec}초 전에 보냈습니다${prev[0]?.by_name ? ` (${prev[0].by_name})` : ""}. 다시 보내려면 확인 후 [그래도 보내기]를 누르세요.`, { code: "DUP", dupOf: prev[0]?.id, sec });
  }

  // 발송 모듈에 요청 — 연락처가 있는 채널만
  const unitName = new Map(b.units.map((u) => [u.id, u.name]));
  const items = rec.flatMap((r) => channels.filter((c) => reachable(r, c)).map((c) => ({ key: `${r.id}|${c}`, channel: c, to: c === "SMS" ? r.phone : r.email, subject: c === "EMAIL" ? `[상황전파] ${message.split("\n")[0].slice(0, 60)}` : undefined, text: message })));
  let acks: Map<string, { accepted: boolean; providerMsgId?: string; reason?: string }>;
  try {
    acks = new Map((await p.send(items)).map((a) => [a.key, a]));
  } catch (e) {
    console.error("[dispatch] provider send failed", e);
    acks = new Map(items.map((it) => [it.key, { accepted: false, reason: "발송 모듈 요청 실패" }]));
  }
  const rows = rec.flatMap((r, i) =>
    channels.map((c) => {
      const a = acks.get(`${r.id}|${c}`);
      const status: SendStatus = !reachable(r, c) ? "연락처 없음" : a?.accepted ? "요청 접수" : "발송 실패";
      return { contact_id: r.id, channel: c, ord: i, name: r.name, title: r.title, unit: unitName.get(r.unitId) ?? "", phone: r.phone, email: r.email, status, reason: a && !a.accepted ? a.reason ?? "요청 거부" : null, provider_msg_id: a?.providerMsgId ?? null };
    }),
  );
  await sql.query(
    `insert into sa_dispatch_to (dispatch_id, contact_id, channel, ord, name, title, unit, phone, email, status, reason, provider_msg_id, requested_at)
     select $1, contact_id, channel, ord, name, title, unit, phone, email, status, reason, provider_msg_id, case when status = '요청 접수' then now() end
     from jsonb_to_recordset($2::jsonb) as x(contact_id text, channel text, ord int, name text, title text, unit text, phone text, email text, status text, reason text, provider_msg_id text)`,
    [id, JSON.stringify(rows)],
  );
  await audit(req.orgId, who.id, "상황전파 발송", { id, channels: channels.map((c) => CH_LABEL[c]), recipients: rec.length, requested: items.length, force: !!req.force, resendOf: req.resendOf ?? null });
  return { dispatch: (await getDispatch(id))!, duplicate: false };
}

/**
 * 발송 결과 반영 (모듈의 결과 알림) — 요청 접수·결과 미확인 상태만 바꿈 (이미 성공·실패로 정해진 건은 그대로)
 */
export async function applyResults(results: { providerMsgId: string; ok: boolean; reason?: string; at?: string }[]) {
  await ensureSchema();
  if (!results.length) return 0;
  const r = (await db().query(
    `update sa_dispatch_to t set status = case when x.ok then '발송 성공' else '발송 실패' end, reason = case when x.ok then null else coalesce(x.reason, '발송 실패') end,
       result_at = coalesce(x.at, now())
     from jsonb_to_recordset($1::jsonb) as x(provider_msg_id text, ok boolean, reason text, at timestamptz)
     where t.provider_msg_id = x.provider_msg_id and t.status in ('요청 접수', '결과 미확인')
     returning t.dispatch_id`,
    [JSON.stringify(results.map((x) => ({ provider_msg_id: x.providerMsgId, ok: x.ok, reason: x.reason ?? null, at: x.at ?? null })))],
  )) as Row[];
  if (r.length) await audit(null, "provider", "발송 결과 수신", { updated: r.length });
  return r.length;
}

/** 모의 모듈 결과 만들기 + 결과 알림이 끝내 오지 않은 건은 결과 미확인으로 (조회할 때 처리 — 서버리스라 예약 작업 대신) */
async function settle(orgId: string) {
  const sql = db();
  await sql.transaction([
    sql.query(
      `update sa_dispatch_to t set
         status = case
           when t.channel = 'SMS' and right(regexp_replace(t.phone, '\\D', '', 'g'), 1) = '9' then '발송 실패'
           when t.channel = 'EMAIL' and t.email ilike '%fail%' then '발송 실패'
           else '발송 성공' end,
         reason = case
           when t.channel = 'SMS' and right(regexp_replace(t.phone, '\\D', '', 'g'), 1) = '9' then '결번·수신 불가 번호 (모의)'
           when t.channel = 'EMAIL' and t.email ilike '%fail%' then '수신 서버 거부 (모의)'
           else null end,
         result_at = now()
       from sa_dispatches d
       where d.id = t.dispatch_id and d.org_id = $1 and d.provider = 'mock' and t.status = '요청 접수'
         and t.requested_at < now() - make_interval(secs => $2::int)
         and not (t.channel = 'SMS' and right(regexp_replace(t.phone, '\\D', '', 'g'), 1) = '8')`,
      [orgId, MOCK_RESULT_SEC],
    ),
    sql.query(
      `update sa_dispatch_to t set status = '결과 미확인', reason = '결과 알림을 받지 못함', result_at = now()
       from sa_dispatches d
       where d.id = t.dispatch_id and d.org_id = $1 and t.status = '요청 접수'
         and t.requested_at < now() - make_interval(secs => case when d.provider = 'mock' then $2::int else $3::int end)`,
      [orgId, RESULT_TIMEOUT_SEC.mock, RESULT_TIMEOUT_SEC.real],
    ),
  ]);
}

function assemble(d: Row, to: Row[]): Dispatch {
  const by = new Map<string, Dispatch["to"][number]>();
  for (const r of to) {
    const k = r.contact_id as string;
    if (!by.has(k)) by.set(k, { id: k, name: r.name as string, title: r.title as string, unit: r.unit as string, phone: r.phone as string, email: r.email as string, result: {}, reason: {} });
    const x = by.get(k)!;
    x.result[r.channel as Channel] = r.status as SendStatus;
    if (r.reason) x.reason![r.channel as Channel] = r.reason as string;
  }
  return {
    id: d.id as string, orgId: d.org_id as string, at: new Date(d.at as string).toISOString(), by: d.by_name as string, byId: d.by_id as string,
    channels: d.channels as Channel[], message: d.message as string, context: (d.context as string) ?? undefined, sel: d.sel as Dispatch["sel"],
    resendOf: (d.resend_of as string) ?? undefined, provider: d.provider as string, to: [...by.values()],
  };
}

export async function getDispatch(id: string): Promise<Dispatch | null> {
  const sql = db();
  const [d, to] = await sql.transaction([
    sql.query("select * from sa_dispatches where id = $1", [id]),
    sql.query("select * from sa_dispatch_to where dispatch_id = $1 order by ord, channel", [id]),
  ]);
  return (d as Row[]).length ? assemble((d as Row[])[0], to as Row[]) : null;
}

export async function listDispatches(orgId: string, limit = 100): Promise<Dispatch[]> {
  await ensureSchema();
  await settle(orgId);
  const sql = db();
  const [ds, to] = await sql.transaction([
    sql.query("select * from sa_dispatches where org_id = $1 order by at desc limit $2", [orgId, limit]),
    sql.query(
      "select t.* from sa_dispatch_to t join (select id from sa_dispatches where org_id = $1 order by at desc limit $2) d on d.id = t.dispatch_id order by t.ord, t.channel",
      [orgId, limit],
    ),
  ], { readOnly: true });
  const byD = new Map<string, Row[]>();
  for (const r of to as Row[]) byD.set(r.dispatch_id as string, [...(byD.get(r.dispatch_id as string) ?? []), r]);
  return (ds as Row[]).map((d) => assemble(d, byD.get(d.id as string) ?? []));
}

