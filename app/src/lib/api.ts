"use client";
/**
 * 서버 API 호출 — 로그인 세션은 쿠키(sa_sid)로 간다 (R7). 401 이면 세션 만료 이벤트를 알린다.
 * 마지막 조작 기록: 사용자가 최근 1분 안에 화면을 조작했을 때만 x-sa-activity: 1 을 보낸다(운영관리 「접속 중」 표시용). 세션 수명은 늘리지 않는다 — 늘리는 길은 [시간 연장] 하나(R57).
 */
let lastActivity = Date.now();
if (typeof window !== "undefined") {
  const mark = () => { lastActivity = Date.now(); };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, mark, { passive: true, capture: true });
}
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const r = await fetch(path, {
    ...rest,
    cache: "no-store",
    credentials: "same-origin",
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), "x-sa-activity": Date.now() - lastActivity < 60_000 ? "1" : "0", ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("sa:session-expired"));
  if (!r.ok) throw new ApiError(r.status, (body as { error?: string }).error ?? `서버 오류 (${r.status})`, body);
  return body as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown) {
    super(message);
  }
}
