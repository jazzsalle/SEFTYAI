import { safeAimRegion } from "@/lib/aiModeLog";
import { audit, ensureSchema, hasDb } from "@/lib/server/db";
import { fail, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai-mode/switch {on, region?} — AI 모드를 켜고 끈 사실을 기록한다(FUN-UFR-907002, 개발서버 AiModeController.Switch d39f8d8·844333a, R63).
 * 켜짐은 화면이 들고 있어 서버는 켜고 끈 일을 모른다 — 화면이 알려 온 것을 기록만 하고 아무 상태도 바꾸지 않는다.
 * 기록에는 누가(계정)·언제(기록 시각)·어느 기준지역(숫자 행정구역 코드만, 아니면 「-」)으로 켰는지만 남기고 질문·답변 내용은 남기지 않는다.
 * 개발서버는 서버 로그(ILogger)에, 우리는 운영 기록 표(sa_audit — 시연 모드 켬/끔과 같은 곳)에 남긴다.
 */
export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const b = (await req.json().catch(() => null)) as { on?: unknown; region?: unknown } | null;
  const on = b?.on === true;
  const region = safeAimRegion(b?.region);
  console.info(`[ai-mode] AI 모드 ${on ? "켬" : "끔"} 사용자 ${who.id} 기준지역 ${region}`);
  await ensureSchema()
    .then(() => audit(null, who.id, on ? "AI 모드 켬" : "AI 모드 끔", { region }))
    .catch((e) => console.error("[ai-mode] 기록", (e as Error).message));
  return new Response(null, { status: 204 });
}
