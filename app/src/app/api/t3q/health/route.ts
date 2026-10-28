import { json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

let cache: { at: number; ok: boolean; version: string | null } | null = null;

/** GET /api/t3q/health — T3Q 연결 상태(30초 캐시). 실패 시 화면 상단 배너 */
export async function GET() {
  if (!cache || Date.now() - cache.at > 30_000) {
    const base = process.env.T3Q_BASE_URL?.replace(/\/v1\/?$/, "");
    let ok = false, version: string | null = null;
    if (process.env.T3Q_MODE === "replay") ok = true;
    else if (base) {
      try {
        const r = await fetch(base + "/health", { signal: AbortSignal.timeout(5000), cache: "no-store" });
        const j = (await r.json().catch(() => null)) as { status?: string; version?: string } | null;
        ok = r.ok && j?.status === "ok";
        version = j?.version ?? null;
      } catch {
        ok = false;
      }
    }
    cache = { at: Date.now(), ok, version };
  }
  return json({ ok: cache.ok, version: cache.version, checkedAt: new Date(cache.at).toISOString() });
}
