import { NextResponse } from "next/server";
import { ACCOUNTS } from "@/lib/config";
import { fixtureConversations } from "@/lib/server/fixtureConvs";

/** 시연용 대화 이력 (서버 저장 전환 후에는 첫 조회 때 서버가 직접 채움 — 이 경로는 호환용) */
export function GET(req: Request) {
  const acc = ACCOUNTS.find((a) => a.id === new URL(req.url).searchParams.get("account"));
  return NextResponse.json(acc ? fixtureConversations(acc) : []);
}
