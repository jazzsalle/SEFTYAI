"use client";
/**
 * 서버 API 호출 — 로그인한 계정 ID를 헤더(x-sa-account)로 함께 보냄
 * (시연판: 별도 인증 서버 없이 계정 ID로 권한을 판정. 실서비스는 세션 인증으로 바꿈)
 */
export function accountId(): string | null {
  try {
    const v = localStorage.getItem("sa.account");
    return v ? (JSON.parse(v) as string) : null;
  } catch {
    return null;
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const r = await fetch(path, {
    ...rest,
    cache: "no-store",
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), "x-sa-account": accountId() ?? "", ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, (body as { error?: string }).error ?? `서버 오류 (${r.status})`, body);
  return body as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown) {
    super(message);
  }
}
