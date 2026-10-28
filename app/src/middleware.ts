import { NextResponse, type NextRequest } from "next/server";

/**
 * 화면 보호 (R7) — 세션 쿠키가 없으면 로그인으로. 쿠키의 유효성(서명·만료)은 API 가 매 요청 확인한다(whoami).
 * API 는 여기서 막지 않고 각 라우트가 401 을 준다(화면이 세션 만료 안내를 띄움).
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("sa_sid")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/explore/:path*", "/history/:path*", "/contacts/:path*", "/admin/:path*", "/settings/:path*", "/report/:path*"] };
