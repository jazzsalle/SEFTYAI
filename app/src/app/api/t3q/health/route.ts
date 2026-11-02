import { json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

let cache: { at: number; ok: boolean; version: string | null } | null = null;

/** GET /api/t3q/health — T3Q 연결 상태(30초 캐시). 실패 시 화면 상단 배너 */
export const maxDuration = 30;
let lastOk: { at: number; version: string | null } | null = null;

export async function GET() {
  if (!cache || Date.now() - cache.at > 30_000) {
    const base = process.env.T3Q_BASE_URL?.replace(/\/v1\/?$/, "");
    let ok = false, version: string | null = null;
    if (process.env.T3Q_MODE === "replay") ok = true;
    else if (base) {
      try {
        const r = await fetch(base + "/health", { signal: AbortSignal.timeout(15000), cache: "no-store" }); // T3Q 가 느릴 때(점검 한 번 6초 안팎, 2026-11-02) 끊김으로 잘못 보이지 않게 15초
        const j = (await r.json().catch(() => null)) as { status?: string; version?: string } | null;
        ok = r.ok && j?.status === "ok";
        version = j?.version ?? null;
      } catch {
        ok = false;
      }
    }
    // T3Q 가 느려 점검이 가끔 늦는 동안(2026-11-02) 띠가 깜빡이지 않게 — 최근 2분 안에 정상이었으면 정상으로 본다
    if (ok) lastOk = { at: Date.now(), version };
    else if (lastOk && Date.now() - lastOk.at < 120_000) {
      ok = true;
      version = lastOk.version;
    }
    cache = { at: Date.now(), ok, version };
  }
  return json({ ok: cache.ok, version: cache.version, checkedAt: new Date(cache.at).toISOString() });
}
