// @vitest-environment jsdom
// 지도 위성 단추(개발서버 MapPane .map-sat) — 누르면 onBasemap 으로 바꿀 배경을 알리고, 위성 타일이 연속 실패하면
// 일반지도("Base")로 돌려놓고 알림. 일반지도 실패는 대체 지도 없이 알림(개발서버). npx vitest run harness/map
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// VWorld 타일 소스(XYZ)를 잡아 두고 타일 실패·성공 이벤트를 직접 낸다 — 진짜 OpenLayers 위에서
const h = vi.hoisted(() => (vi.stubEnv("NEXT_PUBLIC_VWORLD_KEY", "test-key"), { xyz: [] as { url: string; src: { dispatchEvent: (t: string) => unknown } }[] }));
vi.mock("ol/source/XYZ", async (orig) => {
  const Real = ((await orig()) as { default: new (o: { url?: string }) => object }).default;
  class Spy extends Real {
    constructor(o: { url?: string }) {
      super(o);
      h.xyz.push({ url: o.url ?? "", src: this as unknown as { dispatchEvent: (t: string) => unknown } });
    }
  }
  return { default: Spy };
});

import MapView, { DEFAULT_LAYERS, type Basemap } from "@/components/map/MapView";

beforeAll(() => {
  // jsdom 에 없는 것 — 크기 관찰
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  h.xyz.length = 0;
});

const srcOf = (layer: string) => h.xyz.find((x) => x.url.includes(`/${layer}/`))?.src;
const fire = (layer: string, type: string, n: number) =>
  act(() => {
    for (let i = 0; i < n; i++) srcOf(layer)?.dispatchEvent(type);
  });

function view(basemap: Basemap, onBasemap?: (b: Basemap) => void) {
  return render(<MapView region="national" features={[]} basemap={basemap} layers={DEFAULT_LAYERS} onBasemap={onBasemap} />);
}
const SAT_OFF = "위성지도로 보기";
const SAT_ON = "일반지도로 보기";

describe("지도 — 위성 단추(개발서버 MapPane .map-zoom .map-sat)", () => {
  it("onBasemap 을 주지 않으면 위성 단추가 없다 · 확대·축소는 늘 있다(반각 + −)", () => {
    view("Base");
    expect(screen.queryByRole("button", { name: SAT_OFF })).toBeNull();
    expect(screen.getByRole("button", { name: "확대" }).textContent).toBe("+");
    expect(screen.getByRole("button", { name: "축소" }).textContent).toBe("−");
  });

  it("아이콘만 있는 단추가 확대·축소 묶음 맨 위 — 일반지도에서 누르면 위성으로, 위성에서 누르면 일반으로", () => {
    const set = vi.fn();
    const { rerender, container } = view("Base", set);
    const b = screen.getByRole("button", { name: SAT_OFF });
    expect(b.textContent).toBe("");
    expect(b.parentElement?.className).toBe("map-zoom");
    expect(b.parentElement?.firstElementChild).toBe(b);
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(b.getAttribute("title")).toBe(SAT_OFF);
    fireEvent.click(b);
    expect(set).toHaveBeenLastCalledWith("Satellite");
    rerender(<MapView region="national" features={[]} basemap="Satellite" layers={DEFAULT_LAYERS} onBasemap={set} />);
    const on = screen.getByRole("button", { name: SAT_ON });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.className).toContain("is-on");
    fireEvent.click(on);
    expect(set).toHaveBeenLastCalledWith("Base");
    // 축척 막대·출처 띠는 두지 않는다(개발서버)
    expect(container.querySelector(".ol-scale-line, .ol-attribution")).toBeNull();
  });

  it("VWorld 위성(jpeg)·이름 겹(Hybrid) 타일을 쓴다", () => {
    view("Base", vi.fn());
    expect(srcOf("Satellite")).toBeTruthy();
    expect(h.xyz.find((x) => x.url.includes("/Satellite/"))?.url).toMatch(/\.jpeg$/);
    expect(srcOf("Hybrid")).toBeTruthy();
  });

  it("타일은 서버 대리(/api/map/tiles)로 받는다 — 주소에 인증키가 없다(개발서버 MapController tiles)", () => {
    view("Base", vi.fn());
    expect(h.xyz.length).toBeGreaterThan(0);
    for (const x of h.xyz.filter((t) => t.url.includes("/Base/") || t.url.includes("/Satellite/"))) {
      expect(x.url.startsWith("/api/map/tiles/")).toBe(true);
      expect(x.url).not.toContain("test-key");
    }
  });

  it("위성 타일이 연속 실패하면 일반지도로 돌려놓고 알림 「위성지도를 불러오지 못해 일반지도로 돌아왔습니다.」", () => {
    const set = vi.fn();
    view("Satellite", set);
    fire("Satellite", "tileloaderror", 5);
    expect(set).not.toHaveBeenCalled();
    fire("Satellite", "tileloaderror", 1);
    expect(set).toHaveBeenCalledWith("Base");
    const n = screen.getByText("위성지도를 불러오지 못해 일반지도로 돌아왔습니다.").closest(".sa-map-notice");
    expect(n?.getAttribute("role")).toBe("status");
    expect(n?.textContent).toContain("잠시 후 다시 확인하세요.");
    expect(screen.queryByText("배경지도를 불러오지 못했습니다.")).toBeNull();
  });

  it("일반지도 타일이 연속 실패하면 대체 지도 없이 알림 「배경지도를 불러오지 못했습니다.」 — 위성 단추는 그대로, 타일이 다시 오면 거둔다", () => {
    view("Base", vi.fn());
    expect(h.xyz.some((x) => x.url.includes("openstreetmap"))).toBe(false);
    fire("Base", "tileloaderror", 6);
    expect(screen.getByText("배경지도를 불러오지 못했습니다.")).toBeTruthy();
    expect((screen.getByRole("button", { name: SAT_OFF }) as HTMLButtonElement).disabled).toBe(false);
    fire("Base", "tileloadend", 1);
    expect(screen.queryByText("배경지도를 불러오지 못했습니다.")).toBeNull();
  });
});
