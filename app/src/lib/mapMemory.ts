/**
 * 패널을 접었다 펴도 지도를 보던 그대로 — [패널 접기]는 패널을 화면에서 없애므로(explore page panelOpen) 지도 패널의
 * 위성·일반 선택과 OpenLayers 화면(중심·배율)이 같이 사라졌다. 여기 기억해 두었다가 다시 펼칠 때 되살린다(사용자 지시 2026-11-25).
 * 화면 위치는 같은 답·같은 기준지역일 때만 되살린다(열쇠는 MapView viewKey) — 접은 사이 새 답이 오거나 기준지역을 바꾸면
 * 그 답·지역으로 맞춘다. 새로 고치면 처음부터.
 */
export type KeptBasemap = "Base" | "Satellite"

let basemap: KeptBasemap = "Base"
let view: { scope: string; center: number[]; zoom: number } | null = null

export const keptBasemap = () => basemap
export const keepBasemap = (b: KeptBasemap) => {
  basemap = b
}

/** 같은 답(scope)일 때만 돌려준다 */
export const keptView = (scope: string) => (view && view.scope === scope ? view : null)
export const keepView = (scope: string, center: number[] | undefined, zoom: number | undefined) => {
  view = center && zoom !== undefined && Number.isFinite(zoom) ? { scope, center: [...center], zoom } : null
}

/** 자동 시연을 새로 시작할 때 — 앞 시연이 켜 둔 위성·자리가 남지 않게 */
export const forgetMap = () => {
  basemap = "Base"
  view = null
}
