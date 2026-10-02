import { NextResponse } from "next/server";
import { AgentRequest } from "@/lib/contract/agent";
import { answer } from "@/lib/server/agent";

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
      return NextResponse.json(await r.json(), { status: r.status });
    } catch {
      return NextResponse.json({ error: { code: "TIMEOUT", message: "T3Q Agent 응답 지연" } }, { status: 504 });
    }
  }
  // 체감 지연 (시연 : 단계 표시가 보이도록)
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
  return NextResponse.json(answer(parsed.data));
}
