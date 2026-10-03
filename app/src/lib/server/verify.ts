import "server-only";
import gold from "@data/seed/gold_set.json";
import { AgentRequest, AgentResponse, type DetailResponse } from "../contract/agent";
import { checkAnswer, checkRender, checkRequest, type GoldItem, type VerifyResult } from "../verify";
import { answer } from "./agent";
import { detail } from "./agent/detail";

export const GOLD = gold as unknown as { meta: { name: string; builtAt: string; source: string; count: number }; items: GoldItem[] };
export const GOLD_BY_ID = new Map(GOLD.items.map((x) => [x.id, x]));

/** Agent 호출 — T3Q_AGENT_URL 이 있으면 실 T3Q, 없으면 가정 응답 서버 (질의 API와 같은 경로) */
async function callAgent(req: AgentRequest): Promise<AgentResponse> {
  if (process.env.T3Q_AGENT_URL) {
    const r = await fetch(`${process.env.T3Q_AGENT_URL}/agent/query`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.T3Q_API_KEY ? { authorization: `Bearer ${process.env.T3Q_API_KEY}` } : {}) },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(30000),
    });
    return AgentResponse.parse(await r.json());
  }
  return answer(req);
}

/** 정답셋 한 건 실행 → ① 요청 정합 ② 응답 정답 ③ 표출 정합 */
export async function runGold(item: GoldItem, full: boolean): Promise<VerifyResult> {
  const t0 = Date.now();
  const ranAt = new Date().toISOString();
  const parsed = AgentRequest.safeParse({ sessionId: "verify", question: item.question, presetKey: item.presetKey, context: item.context });
  const empty = { req: { mark: "fail" as const, rows: [], hasEcho: false, same: 0, diff: 0 }, ans: null, render: { mark: "na" as const, rows: [] } };
  if (!parsed.success) {
    return { id: item.id, ranAt, ms: 0, status: "error", intent: "-", ...empty, error: `보낸 질의가 계약(스키마)에 맞지 않음 : ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}` };
  }
  const request = parsed.data;
  try {
    const response = await callAgent(request);
    const details: Record<string, DetailResponse | null> = {};
    for (const v of item.expect.values ?? []) {
      const k = `${v.entityType}:${v.entityId}`;
      if (k in details) continue;
      // 상세조회 실패는 해당 항목값 불일치로 집계 (Agent 호출 실패와 구분)
      try { details[k] = detail(v.entityType, v.entityId, request.context); } catch { details[k] = null; }
    }
    return {
      id: item.id, ranAt, ms: Date.now() - t0, status: response.status, intent: response.intent,
      req: checkRequest(request, response),
      ans: checkAnswer(item, response, details),
      render: checkRender(response),
      ...(full ? { request, response } : {}),
    };
  } catch (e) {
    return { id: item.id, ranAt, ms: Date.now() - t0, status: "error", intent: "-", ...empty, error: `Agent 호출 실패 : ${e instanceof Error ? e.message.slice(0, 200) : "알 수 없는 오류"}` };
  }
}
