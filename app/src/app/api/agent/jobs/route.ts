import type { ClientCondition } from "@/lib/server/queryContext";
import { jobInputOf } from "@/lib/server/jobInput";
import { parseBaseWire } from "@/lib/baseRegion";
import { runPreview } from "@/lib/server/preview";
import { jobSummary, listJobs, medianMs, setPreview, submitJob, sweepAny, type JobSource } from "@/lib/server/jobs";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";
import { t3qConfigured } from "@/lib/t3q/client";

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
  // 기준지역(R32) — 숫자 코드 2·5·8자리·단계 일치·이름 80자까지. 틀린 값은 보내지 않고 거절한다(null = 전국)
  const base = b?.condition?.base;
  if (base !== undefined && base !== null && !parseBaseWire(base)) return fail(400, "기준지역 값이 올바르지 않습니다.");
  // 3초 중복 차단 — AI 모드 점검은 빼다: 같은 계정의 재요청은 submitJob 이 같은 작업으로 모은다(진행 중이면 합류, 끝났으면 R39 원래 작업).
  // 막으면 켜자마자 새로 고침·새 탭·껐다 켬에서 창이 답 없이 머문다
  if (source !== "AI_MODE") {
    const dupKey = `${who.id}:${question}:${b?.convId ?? ""}`;
    const last = recent.get(dupKey);
    if (last && Date.now() - last < 3000 && !b?.noCache) return fail(429, "같은 질문을 방금 보냈습니다.");
    recent.set(dupKey, Date.now());
  }

  // 문항 재난유형 · R33(임시) · R39(AI 모드 점검은 기준지역만 — 특보는 weather_warnings 로 따로) — lib/server/jobInput
  const input = jobInputOf(who, b, question, source);
  // R3 — 정의된 질문(라이브러리·브리핑·특보)만 Data API 자동 조회. 자유 질문은 하지 않는다
  const previewP = b?.libraryId ? runPreview(b.libraryId, input.queryContext ?? {}).catch(() => undefined) : Promise.resolve(undefined);
  let job = await submitJob(who, input);
  const preview = await previewP;
  if (preview) job = (await setPreview(job.id, preview)) ?? job;
  return json({ job }, 201);
}
