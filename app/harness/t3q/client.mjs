// 하네스 공용 T3Q 클라이언트 — app/.env.local 의 T3Q_BASE_URL · T3Q_CLIENT_TOKEN 을 읽는다(토큰은 출력하지 않는다).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = join(HERE, "..", "..");

export function loadEnv() {
  const f = join(APP, ".env.local");
  if (existsSync(f)) {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  if (!process.env.T3Q_BASE_URL || !process.env.T3Q_CLIENT_TOKEN) throw new Error("T3Q_BASE_URL · T3Q_CLIENT_TOKEN 이 없다 (app/.env.local)");
  return { base: process.env.T3Q_BASE_URL.replace(/\/$/, ""), token: process.env.T3Q_CLIENT_TOKEN };
}

export async function t3q(method, path, body, { timeoutMs = 60000 } = {}) {
  const { base, token } = loadEnv();
  const t0 = Date.now();
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 본문이 JSON 이 아님 */ }
  return { http: res.status, ms: Date.now() - t0, json, text: json ? undefined : text.slice(0, 500) };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ASYNC 질의 → 3초 간격 결과 조회. 끝나면 {final, waitedMs, polls} */
export async function askAsync(question, extra = {}, { pollMs = 3000, maxMs = 8 * 60000, onPoll } = {}) {
  const t0 = Date.now();
  const sub = await t3q("POST", "/agent/query", { question, response_mode: "ASYNC", ...extra });
  const rid = sub.json?.result?.request_id || sub.json?.request_id;
  if (sub.http !== 202 || !rid) return { submit: sub, final: sub.json, waitedMs: Date.now() - t0, polls: 0 };
  let polls = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(pollMs);
    polls++;
    const r = await t3q("GET", `/agent/query/${rid}`);
    onPoll?.(r);
    if (r.http !== 202) return { requestId: rid, submitMs: sub.ms, final: r.json, http: r.http, waitedMs: Date.now() - t0, polls };
  }
  return { requestId: rid, timeout: true, waitedMs: Date.now() - t0, polls };
}

export function save(rel, data) {
  const f = join(APP, "harness", rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(data, null, 2), "utf8");
  return f;
}
