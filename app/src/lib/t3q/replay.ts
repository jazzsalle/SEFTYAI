import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { T3qResult } from "./client";

/**
 * 재생 모드(T3Q_MODE=replay) — 개발·테스트 전용 (R9). harness/recordings 의 T3Q 실응답을 돌려준다.
 * 운영 배포에서는 client.ts 가 막는다. 녹화본에 없는 요청은 503.
 * ASYNC: 제출 → PROCESSING, 결과 조회 2회까지 RUNNING, 그 뒤 녹화된 최종 응답(질문 문구가 같은 녹화본, 없으면 첫 녹화본)
 */
type Rec = { method: string; path: string; body: unknown; response: unknown };
let cache: { data: Rec[]; agent: { question: string; final: unknown }[] } | null = null;
const jobs = new Map<string, { question: string; polls: number }>();

function load() {
  if (cache) return cache;
  const dir = join(process.cwd(), "harness", "recordings");
  const data: Rec[] = [];
  const agent: { question: string; final: unknown }[] = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir, { recursive: true }) as string[]) {
      if (!f.endsWith(".json")) continue;
      const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (Array.isArray(j)) for (const r of j) if (r?.path && r?.response) data.push({ method: r.method, path: r.path, body: r.body, response: r.response });
      for (const r of j?.runs ?? []) if (r?.final) agent.push({ question: r.question, final: r.final });
      if (j?.question && j?.final) agent.push({ question: j.question, final: j.final });
    }
  }
  return (cache = { data, agent });
}

const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

export async function replay<T>(method: string, path: string, body?: unknown, requestId?: string): Promise<T3qResult<T>> {
  const { data, agent } = load();
  const rid = requestId ?? Math.random().toString(16).slice(2).padEnd(32, "0");
  const ok = (j: unknown, http = 200) => ({ http, ms: 5, requestId: rid, envelope: true, body: j as T });
  if (method === "POST" && path === "/agent/query") {
    const q = String((body as { question?: string })?.question ?? "");
    jobs.set(rid, { question: q, polls: 0 });
    return ok({ schema_version: "2.0", request_id: rid, status: "PROCESSING", result: { request_id: rid, poll: `/v1/agent/query/${rid}` }, data_gaps: [], warnings: [], meta: { source: "T3Q" } }, 202);
  }
  const m = path.match(/^\/agent\/query\/([^/]+)$/);
  if (method === "GET" && m) {
    const j = jobs.get(m[1]);
    if (!j) return ok({ schema_version: "2.0", status: "NO_RESULT", result: { request_id: m[1], job_status: "NOT_FOUND" }, data_gaps: [], warnings: [], meta: { source: "T3Q" } });
    if (j.polls++ < 2) return ok({ schema_version: "2.0", status: "PROCESSING", result: { request_id: m[1], job_status: "RUNNING" }, data_gaps: [], warnings: [], meta: { source: "T3Q" } }, 202);
    const hit = agent.find((a) => a.question === j.question) ?? agent[0];
    return hit ? ok(hit.final) : { http: 503, ms: 1, requestId: rid, envelope: false, body: null, error: "재생 녹화본 없음" };
  }
  const hit = data.find((r) => r.method === method && r.path === path && (method === "GET" || canon(r.body) === canon(body))) ?? data.find((r) => r.method === method && r.path === path);
  if (hit) return ok(hit.response);
  return { http: 503, ms: 1, requestId: rid, envelope: false, body: null, error: `재생 녹화본 없음: ${method} ${path}` };
}
