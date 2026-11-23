export const dynamic = "force-dynamic";

/**
 * GET /api/version — 지금 올라 있는 배포본의 판 번호(개발서버 dist/version.json · f668628). 열려 있는 화면이 자기 판 번호와 견줘 다르면 새로고침한다(lib/appUpdate).
 * 판 번호는 빌드 때 박힌다(next.config.ts NEXT_PUBLIC_BUILD_ID). 공개 값이라 로그인 없이 준다. 캐시하지 않는다
 */
export function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
