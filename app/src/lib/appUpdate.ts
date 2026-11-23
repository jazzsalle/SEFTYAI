/**
 * 새 배포본이 올라오면 열려 있는 화면을 알아서 새로고침한다(개발서버 core/update/appUpdate.ts · f668628 을 옮김).
 * 빌드마다 판 번호를 화면 코드(NEXT_PUBLIC_BUILD_ID — next.config.ts)와 서버(/api/version)에 적고, 열린 화면이 가끔 서버 것을 읽어 견준다. 다르면 새로고침한다.
 * 하던 일을 잃지 않게 — 답을 기다리는 중·글을 쓰는 중·창(모달)이 열린 중이면 알림만 띄우고, 끝나는 대로 새로고침한다.
 * Vercel 「Skew Protection」을 켜면 옛 화면의 요청이 옛 배포본으로 가 판 번호가 바뀌지 않는다 — 켜지 않은 지금 설정에서 동작한다
 */

/** 이 화면의 판 번호. 개발 서버(next dev)는 「dev」라 비교하지 않는다 */
export const CurrentBuild: string = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
/** 서버 판 번호를 읽는 간격 */
export const CheckEveryMs = 60_000;
/** 새 판이 있는데 바쁠 때 「이제 바쁘지 않은가」를 보는 간격 */
export const IdleCheckEveryMs = 5_000;
/** 새로고침 직후 이 시간 안에는 다시 자동 새로고침하지 않는다(판 번호가 어긋난 채 계속 도는 일을 막는다) */
export const ReloadCooldownMs = 30_000;
const ReloadedAtKey = "sa.update.reloadedAt";

type Guard = () => boolean;
const guards = new Set<Guard>();
const listeners = new Set<(pending: boolean) => void>();
let pending = false;
let started = false;

/** 「지금은 새로고침하지 말라」는 자리를 등록한다. 돌려주는 함수로 거둔다 */
export function registerBusyGuard(guard: Guard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

export const isUpdatePending = () => pending;

export function onPendingChange(listener: (pending: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setPending(value: boolean) {
  if (pending === value) return;
  pending = value;
  listeners.forEach((l) => l(value));
}

/** 지금 새로고침하면 하던 일을 잃는가 — ① 등록된 자리가 바쁘다고 하거나 ② 열린 모달 창이 있거나 ③ 글이 든 입력칸에 커서가 있으면 */
export function isBusy(doc: Document = document): boolean {
  for (const g of guards) {
    try {
      if (g()) return true;
    } catch {
      // 한 자리의 오류가 새로고침을 영영 막지 않게
    }
  }
  if (doc.querySelector('[role="dialog"][aria-modal="true"]') !== null) return true;
  const el = doc.activeElement;
  if (el instanceof HTMLTextAreaElement) return el.value.trim().length > 0;
  if (el instanceof HTMLInputElement) return ["text", "search", "password", "email", "tel", "url", "number"].includes(el.type) && el.value.trim().length > 0;
  return false;
}

/** 서버에 올라 있는 판 번호. 읽지 못하면 null — 네트워크가 끊긴 것을 새 판으로 오해하지 않는다 */
export async function fetchLatestBuild(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher(`/api/version?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: unknown };
    return typeof body.id === "string" && body.id !== "" ? body.id : null;
  } catch {
    return null;
  }
}

/** 서버 판 번호가 이 화면의 것과 다른가. 「dev」와 읽지 못한 값(null)은 다르다고 보지 않는다 */
export function isNewer(latest: string | null, current: string = CurrentBuild): boolean {
  return latest !== null && latest !== "dev" && current !== "dev" && latest !== current;
}

function recentlyReloaded(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(ReloadedAtKey));
    return Number.isFinite(at) && at > 0 && now - at < ReloadCooldownMs;
  } catch {
    return false;
  }
}

/** 새로고침한다. 직전에 했으면 하지 않는다(무한 반복 방지). force = 사람이 단추로 누름 */
export function reloadNow(force = false): boolean {
  if (!force && recentlyReloaded()) return false;
  try {
    sessionStorage.setItem(ReloadedAtKey, String(Date.now()));
  } catch {
    // 저장하지 못해도 새로고침은 한다
  }
  window.location.reload();
  return true;
}

/** 한 번 확인 — 새 판이면 대기로 두고, 바쁘지 않으면 바로 새로고침한다 */
export async function checkOnce(fetcher?: typeof fetch): Promise<void> {
  const latest = await fetchLatestBuild(fetcher);
  if (!isNewer(latest)) return;
  setPending(true);
  if (!isBusy()) reloadNow();
}

/** 옛 번들 조각(chunk)을 못 찾아 지연 로딩이 실패했는가 — 새 판이 올라가 옛 조각이 사라진 경우(개발서버 vite:preloadError 와 같은 경우) */
export function isChunkError(e: unknown): boolean {
  const x = e as { name?: unknown; message?: unknown } | null;
  return !!x && (x.name === "ChunkLoadError" || (typeof x.message === "string" && /Loading (CSS )?chunk [\w-]+ failed/i.test(x.message)));
}

/** 감시 시작(앱 시작 때 한 번) — 1분마다·탭이 다시 보일 때·포커스를 받을 때·네트워크가 돌아올 때 확인. 미뤘으면 바쁜 일이 끝나는 대로 새로고침 */
export function startUpdateWatcher() {
  if (started || CurrentBuild === "dev" || typeof window === "undefined") return;
  started = true;
  const check = () => void checkOnce();
  window.setInterval(check, CheckEveryMs);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.setInterval(() => {
    if (pending && !isBusy()) reloadNow();
  }, IdleCheckEveryMs);
  const onChunk = (e: unknown) => {
    if (!isChunkError(e)) return;
    setPending(true);
    reloadNow();
  };
  window.addEventListener("error", (ev) => onChunk(ev.error));
  window.addEventListener("unhandledrejection", (ev) => onChunk(ev.reason));
}
