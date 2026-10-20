import { NextResponse } from "next/server";
import { AgentRequest } from "@/lib/contract/agent";
import { answer } from "@/lib/server/agent";
import { hasDb } from "@/lib/server/db";
import { traceAdd } from "@/lib/server/kvStore";
import { whoami } from "@/lib/server/who";

/** 연계 추적로그 (D39) — 응답마다 서버가 직접 남김. 기록 실패는 응답에 영향 주지 않음 */
async function trace(req: Request, q: string, t0: number, r: { intent?: string; status?: string; requestId?: string; trace?: { apis?: string[]; datasets?: string[]; elapsedMs?: number } } | null, failStatus?: string) {
  if (!hasDb()) return;
  try {
    await traceAdd({
      accountId: whoami(req)?.id ?? null, api: r?.trace?.apis?.join(", ") || "T3Q Agent", intent: r?.intent ?? "-", status: failStatus ?? r?.status ?? "-",
      ms: r?.trace?.elapsedMs ?? Date.now() - t0, q, requestId: r?.requestId ?? "-", datasets: r?.trace?.datasets ?? [],
    });
  } catch (e) {
    console.error("[trace] 기록 실패", e);
  }
}

/**
 * POST /api/agent/query — T3Q Agent 질의 (시연용 응답 서버)
 * 실 연계 시 T3Q_AGENT_URL 지정 → 동일 계약으로 프록시
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "JSON 형식 오류" } }, { status: 400 });
  }
  const t0 = Date.now();
  const parsed = AgentRequest.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message } }, { status: 400 });

  if (process.env.T3Q_AGENT_URL) {
    try {
      const r = await fetch(`${process.env.T3Q_AGENT_URL}/agent/query`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(process.env.T3Q_API_KEY ? { authorization: `Bearer ${process.env.T3Q_API_KEY}` } : {}) },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(30000),
      });
      const j = await r.json();
      await trace(req, parsed.data.question, t0, r.ok ? j : null, r.ok ? undefined : `HTTP ${r.status}`);
      return NextResponse.json(j, { status: r.status });
    } catch {
      await trace(req, parsed.data.question, t0, null, "TIMEOUT");
      return NextResponse.json({ error: { code: "TIMEOUT", message: "T3Q Agent 응답 지연" } }, { status: 504 });
    }
  }
  // 체감 지연 (시연 : 단계 표시가 보이도록)
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
  const res = answer(parsed.data);
  await trace(req, parsed.data.question, t0, res);
  return NextResponse.json(res);
}
