import type { AdminAccountRow } from "@/lib/adminTypes";
import { ACCOUNTS } from "@/lib/config";
import { errText, requireOperator } from "@/lib/server/admin";
import { db, ensureSchema } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

interface Row {
  id: string; name: string; org: string; role: string; status: string; failed_count: number;
  locked_until: string | null; locked: boolean; last_login_at: string | null; created_at: string | null; session_seen_at: string | null;
}
/** 화면 순서 — 부산·인제·영천·정부기관·운영자 */
const ORDER = ["bs_safety01", "ij_safety01", "yc_safety02", "mois_dsd01", "admin01"];

/**
 * GET /api/admin/accounts — 계정 목록 (운영자 전용)
 * sa_accounts(발급 상태·연속 실패·잠금·최근 로그인) + 살아 있는 세션의 마지막 활동. 설정에만 있고 발급 전인 계정도 함께 보인다.
 */
export async function GET(req: Request) {
  const g = await requireOperator(req);
  if (g.res) return g.res;
  try {
    await ensureSchema();
    const rows = (await db().query(
      `select a.id, a.name, a.org, a.role, a.status, a.failed_count, a.locked_until,
              (a.locked_until is not null and a.locked_until > now()) as locked,
              a.last_login_at, a.created_at,
              (select max(s.last_seen_at) from sa_sessions s
                where s.account_id = a.id and s.revoked_at is null and s.expires_at > now()
                  and s.last_seen_at > now() - interval '4 hours') as session_seen_at
         from sa_accounts a
        order by a.id`,
    )) as Row[];
    const conf = [...ACCOUNTS].sort((x, y) => (ORDER.indexOf(x.id) + 1 || 99) - (ORDER.indexOf(y.id) + 1 || 99));
    const out: AdminAccountRow[] = conf.map((a) => {
      const r = rows.find((x) => x.id === a.id);
      return {
        id: a.id, name: a.name, org: a.org, dept: a.dept, role: a.role, issued: !!r, known: true,
        status: r?.status ?? null, failed_count: r?.failed_count ?? 0, locked_until: r?.locked_until ?? null, locked: !!r?.locked,
        last_login_at: r?.last_login_at ?? null, created_at: r?.created_at ?? null, session_seen_at: r?.session_seen_at ?? null,
      };
    });
    for (const r of rows.filter((x) => !ACCOUNTS.some((a) => a.id === x.id)))
      out.push({
        id: r.id, name: r.name, org: r.org, dept: null, role: r.role, issued: true, known: false,
        status: r.status, failed_count: r.failed_count, locked_until: r.locked_until, locked: !!r.locked,
        last_login_at: r.last_login_at, created_at: r.created_at, session_seen_at: r.session_seen_at,
      });
    return json({ accounts: out });
  } catch (e) {
    return fail(500, "계정 목록을 불러오지 못했습니다. " + errText(e));
  }
}
