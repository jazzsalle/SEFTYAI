import { buildQueryContext, type ClientCondition } from "@/lib/server/queryContext";
import { runPreview } from "@/lib/server/preview";
import { jobSummary, listJobs, medianMs, setPreview, submitJob, sweepAny, type JobSource } from "@/lib/server/jobs";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";
import { t3qConfigured } from "@/lib/t3q/client";
import { libById } from "@/lib/library";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SOURCES: JobSource[] = ["USER", "BRIEFING", "QUICK", "SUGGEST", "LIBRARY", "FOLLOW_UP", "AI_MODE"];
const recent = new Map<string, number>(); // 같은 글 3초 안 연타 차단(UFR 중복 전송)

/** GET /api/agent/jobs?active=1&all=1 — 질문 큐(본인, 운영자는 all) */
export async function GET(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const u = new URL(req.url).searchParams;
  await sweepAny(2).catch((e) => { console.error("[jobs] sweepAny", e); return 0; }); // 방치된 작업 조금씩 진행
  const jobs = await listJobs(who, { active: u.get("active") === "1", all: u.get("all") === "1", limit: Number(u.get("limit")) || 50 });
  return json({ jobs: jobs.map(jobSummary), medianMs: await medianMs() });
}

/**
 * POST /api/agent/jobs — 질문 접수 (R1)
 * {question, source, libraryId?, convId?, turnNo?, condition?, warnings?, briefing?, quickQueryId?, aiMode?, followUp?, noCache?}
 */
export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  if (!t3qConfigured() && process.env.T3Q_MODE !== "replay") return fail(503, "에이전트 서버 연결 설정이 없습니다.");
  const b = (await req.json().catch(() => null)) as {
    question?: string; source?: JobSource; libraryId?: string; convId?: string; turnNo?: number; condition?: ClientCondition;
    warnings?: Record<string, unknown> | null; briefing?: Record<string, unknown>; quickQueryId?: string; aiMode?: Record<string, unknown>;
    followUp?: { jobId: string; refs?: { display_name?: string; entity_type?: string }[] }; noCache?: boolean;
  } | null;
  const question = b?.question?.trim();
  if (!question) return fail(400, "질문을 입력하세요.");
  if (question.length > 2000) return fail(400, "질문은 2,000자까지 입력할 수 있습니다.");
  const source = SOURCES.includes(b!.source as JobSource) ? (b!.source as JobSource) : "USER";
  const dupKey = `${who.id}:${question}:${b?.convId ?? ""}`;
  const last = recent.get(dupKey);
  if (last && Date.now() - last < 3000 && !b?.noCache) return fail(429, "같은 질문을 방금 보냈습니다.");
  recent.set(dupKey, Date.now());

  const lib = b?.libraryId ? libById(b.libraryId) : undefined;
  const queryContext = buildQueryContext(who, b?.condition, lib?.disasterTypes);
  // R3 — 정의된 질문(라이브러리·브리핑·특보)만 Data API 자동 조회. 자유 질문은 하지 않는다
  const previewP = b?.libraryId ? runPreview(b.libraryId, queryContext).catch(() => undefined) : Promise.resolve(undefined);
  let job = await submitJob(who, {
    question, source, libraryId: b?.libraryId ?? null, convId: b?.convId ?? null, turnNo: b?.turnNo ?? null,
    queryContext, weatherWarnings: b?.warnings ?? null, briefing: b?.briefing ?? null, quickQueryId: b?.quickQueryId ?? null,
    aiMode: b?.aiMode ?? null, followUp: b?.followUp ?? null, noCache: !!b?.noCache,
  });
  const preview = await previewP;
  if (preview) job = (await setPreview(job.id, preview)) ?? job;
  return json({ job }, 201);
}
