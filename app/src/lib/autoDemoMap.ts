/**
 * 자동 시연이 지도 위 대상을 집는 길(R54).
 * 개발서버는 Leaflet 이라 지도 점·묶음·구 이름표가 DOM 요소(.map-pin · .map-cluster · .sm-map-label)여서 선택자로 집었다.
 * 우리 지도(OpenLayers)는 캔버스에 그리므로 지도에게 「이런 대상이 화면 어디에 있나」를 묻고(MapView 가 답함),
 * 그 자리에 보이지 않는 표(.autodemo-mark)를 띄워 커서·강조가 선택자로 따라가게 한다. 표를 누르면 지도에 그 자리 누르기(singleclick)를 낸다.
 */
export type MapTargetKind = "cluster" | "pin" | "area";

export interface MapQuery {
  kind: MapTargetKind;
  /** 이름에 이 글자가 든 것(pin · area) */
  text?: string;
  /** 근사 위치(행정구역 중심) 점은 빼고 — 상세가 없다(개발서버 .map-pin:not(.map-pin--approx)) */
  exact?: boolean;
}

/** 찾은 자리 — 화면 좌표(client) */
export interface MapHit {
  x: number;
  y: number;
  /** 커서·강조 상자 크기(px) */
  size: number;
  name: string;
}

export const MAP_FIND_EVENT = "sa:autodemo-map-find";
export const MAP_CLICK_EVENT = "sa:autodemo-map-click";

/** 대본 선택자의 지도 몫 — "@map:cluster" · "@map:pin" · "@map:pin-exact" · "@map:area" */
export function parseMapSel(sel: string): Omit<MapQuery, "text"> | null {
  const m = /^@map:(cluster|pin-exact|pin|area)$/.exec(sel.trim());
  if (!m) return null;
  if (m[1] === "pin-exact") return { kind: "pin", exact: true };
  return { kind: m[1] as MapTargetKind };
}

/** 지도에게 묻는다 — 지도가 없으면(패널 닫힘 등) null */
export function findOnMap(q: MapQuery): MapHit | null {
  if (typeof window === "undefined") return null;
  const box: { hit: MapHit | null } = { hit: null };
  window.dispatchEvent(new CustomEvent(MAP_FIND_EVENT, { detail: { q, box } }));
  return box.hit;
}

/** 지도 자리 누르기 */
export function clickOnMap(x: number, y: number) {
  window.dispatchEvent(new CustomEvent(MAP_CLICK_EVENT, { detail: { x, y } }));
}

let seq = 0;

/**
 * 찾은 자리에 표를 띄운다(이미 같은 질의의 표가 있으면 옮긴다). 표를 누르면 그 순간 다시 찾아 그 자리를 누른다(지도가 그사이 움직였을 수 있다).
 * 돌려주는 값 = 표의 선택자. 못 찾으면 null
 */
export function markOnMap(q: MapQuery): string | null {
  const hit = findOnMap(q);
  if (!hit) return null;
  const el = document.createElement("div");
  el.className = "autodemo-mark";
  el.dataset.demoT = `m${++seq}`;
  el.setAttribute("aria-hidden", "true");
  el.textContent = hit.name;
  place(el, hit);
  el.addEventListener("click", () => {
    const now = findOnMap(q) ?? hit;
    place(el, now);
    clickOnMap(now.x, now.y);
  });
  document.body.appendChild(el);
  return `[data-demo-t="${el.dataset.demoT}"]`;
}

function place(el: HTMLElement, h: MapHit) {
  el.style.left = `${h.x - h.size / 2}px`;
  el.style.top = `${h.y - h.size / 2}px`;
  el.style.width = `${h.size}px`;
  el.style.height = `${h.size}px`;
}

/** 시연이 끝나거나 장면이 바뀌면 표를 걷는다 */
export function clearMapMarks() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".autodemo-mark").forEach((e) => e.remove());
}
