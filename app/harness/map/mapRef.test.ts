// 지도 대상 열쇠·확대 규칙·점 묶기·집기 참조 — 개발 서버 MapPane·entityId·riskObjectId·adminCenter 이식(2026-11-06). npx vitest run harness/map
import { describe, expect, it } from "vitest";
import {
  CLUSTER_PX, adminCenterCode, adminLookupOf, centerLabel, clusterPoints, coreIndices, detailIdOf, entityKey, focusZoomOf,
  hasDetail, objectIdOf, pointZoom, sameObject, symbolOf,
} from "@/lib/mapRef";
import { objectRefsOf } from "@/lib/server/jobInput";

const ref = (o: Partial<Parameters<typeof entityKey>[0]> = {}) => ({ ref: "r1", entity_type: "RISK_FACTOR", display_name: "만덕지하차도", ...o });

describe("대상 열쇠(entityKey·objectIdOf·detailIdOf)", () => {
  it("지도 열쇠가 있으면 key:value, 없으면 ref — 여러 답을 건너 같은 대상을 가린다", () => {
    expect(entityKey(ref({ map: { key: "underpass_id", value: "614" } }))).toBe("underpass_id:614");
    expect(entityKey(ref())).toBe("ref:r1");
  });
  it("참조 객체 ID 는 entity_id → spatial_object_id → key:value, 아무것도 없으면 null", () => {
    expect(objectIdOf(ref({ entity_id: "UP-614", spatial_object_id: "S1", map: { key: "k", value: "v" } }))).toBe("UP-614");
    expect(objectIdOf(ref({ spatial_object_id: "S1", map: { key: "k", value: "v" } }))).toBe("S1");
    expect(objectIdOf(ref({ map: { key: "k", value: "v" } }))).toBe("k:v");
    expect(objectIdOf(ref())).toBeNull();
  });
  it("상세 ID 는 실측 표 열쇠만(UP-·SL-·HZ-), 표에 없는 열쇠는 지어 맞추지 않는다", () => {
    expect(detailIdOf(ref({ map: { key: "underpass_id", value: "614" } }))).toBe("UP-614");
    expect(detailIdOf(ref({ map: { key: "slope_no", value: "2632000064" } }))).toBe("SL-2632000064");
    expect(detailIdOf(ref({ map: { key: "hazard_zone_id", value: "7" } }))).toBe("HZ-7");
    expect(detailIdOf(ref({ map: { key: "river_id", value: "7" } }))).toBeNull();
    expect(detailIdOf(ref({ entity_id: "SL-1", map: { key: "river_id", value: "7" } }))).toBe("SL-1");
  });
});

describe("말풍선 「상세 보기」 유무(hasDetail·sameObject)", () => {
  it("보여 줄 속성이 하나라도 있어야 참", () => {
    expect(hasDetail(null)).toBe(false);
    expect(hasDetail({ risk: { attributes: [{ value: "" }, { value: null }] } })).toBe(false);
    expect(hasDetail({ risk: { attributes: [{ value: "U형" }] } })).toBe(true);
    expect(hasDetail({ risk: { designation_reason: "침수" } })).toBe(true);
  });
  it("이름은 띄어쓰기만 빼고 견주고, 견줄 이름이 없으면 막지 않는다", () => {
    expect(sameObject("만덕 지하차도", "만덕지하차도")).toBe(true);
    expect(sameObject("만덕지하차도", "온천지하차도")).toBe(false);
    expect(sameObject(null, "온천지하차도")).toBe(true);
  });
});

describe("확대 규칙(focusZoomOf·pointZoom)", () => {
  it("시군구 → 11, 행정구역 중심 → 14, 정확한 점 → 17", () => {
    expect(focusZoomOf("sigungu_center")).toBe(11);
    expect(focusZoomOf("dong_center")).toBe(14);
    expect(focusZoomOf("exact")).toBe(17);
    expect(focusZoomOf(null)).toBe(17);
  });
  it("정확한 점은 더 가까운 지금 배율을 지키고, 근사한 점은 그 칸까지 물러난다", () => {
    expect(pointZoom("exact", 18)).toBe(18);
    expect(pointZoom("exact", 12)).toBe(17);
    expect(pointZoom("dong_center", 18)).toBe(14);
  });
});

describe("점 묶기(clusterPoints)", () => {
  it("56px 안의 점은 한 묶음, 먼 점은 낱개 — 모든 점이 꼭 한 번씩", () => {
    const pts = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 50, y: 10 }, { x: 500, y: 500 }];
    const g = clusterPoints(pts);
    expect(g.flat().sort()).toEqual([0, 1, 2, 3]);
    expect(g.find((m) => m.includes(3))).toEqual([3]);
    expect(g.find((m) => m.includes(0))?.sort()).toEqual([0, 1, 2]);
  });
  it("이웃이 많은 점부터 씨앗 — 격자 경계로 「3」「3」이 갈라서지 않는다", () => {
    // 가운데 점(1)이 양옆을 다 끌어들인다. 왼쪽(0)부터 씨앗이면 0·1 과 2 로 갈렸을 것
    const pts = [{ x: 0, y: 0 }, { x: CLUSTER_PX - 1, y: 0 }, { x: 2 * CLUSTER_PX - 2, y: 0 }];
    expect(clusterPoints(pts)).toEqual([[0, 1, 2]]);
  });
});

describe("처음 맞춤에서 먼 것 빼기(coreIndices)", () => {
  it("무리에서 아주 먼 점(바다 위 좌표)은 맞춤 범위에서만 뺀다", () => {
    const busan: [number, number][] = [[129.05, 35.2], [129.06, 35.21], [129.07, 35.19], [129.05, 35.22]];
    expect(coreIndices([...busan, [129.0, 33.0]])).toEqual([0, 1, 2, 3]);
  });
  it("가까이 모인 것은 모두 남긴다(최소 5km)", () => {
    expect(coreIndices([[127, 37], [127.01, 37.01]])).toEqual([0, 1]);
    expect(coreIndices([])).toEqual([]);
  });
});

describe("행정구역 중심 이름(adminCenterCode·centerLabel)", () => {
  it("중심점일 때만, 행정코드를 브이월드 자리수로", () => {
    expect(adminCenterCode("exact", "26260")).toBeNull();
    expect(adminCenterCode("sigungu_center", "26260")).toBe("26260");
    expect(adminCenterCode("dong_center", "2626010800")).toBe("26260108");
    expect(adminCenterCode("sigungu_center", "2626000000")).toBe("26260");
    expect(adminCenterCode("sido_center", "2600000000")).toBe("26");
    expect(adminCenterCode("dong_center", "abc")).toBeNull();
    expect(adminLookupOf("26260108")).toEqual({ level: "emd", parent: "26260" });
    expect(adminLookupOf("26260")).toEqual({ level: "sigungu", parent: "26" });
  });
  it("이름을 알면 「○○ 중심」, 모르면 받은 이름에 (행정구역 중심 좌표)", () => {
    const names = new Map([["42810", "인제군"]]);
    expect(centerLabel("귀둔지구", "sigungu_center", "42810", names)).toBe("인제군 중심");
    expect(centerLabel("귀둔지구", "sigungu_center", "42820", names)).toBe("귀둔지구 (행정구역 중심 좌표)");
    expect(centerLabel("귀둔지구", "exact", "42810", names)).toBe("귀둔지구");
  });
});

describe("지도 표시 갈래(symbolOf)", () => {
  it("유형 → 갈래, 모르는 유형은 「그 밖」", () => {
    expect(symbolOf("EVENT")).toBe("event");
    expect(symbolOf("RISK_FACTOR_FACILITY")).toBe("factor");
    expect(symbolOf("RISK_AREA")).toBe("area");
    expect(symbolOf("PLAN")).toBe("plan");
    expect(symbolOf("WHATEVER")).toBe("other");
  });
});

describe("집은 참조 → 질의(objectRefsOf)", () => {
  it("ID·이름은 다듬어 겹침을 빼고, 50건까지만", () => {
    const got = objectRefsOf([{ id: " UP-614 ", name: "만덕지하차도" }, { id: "UP-614", name: "만덕지하차도" }, { name: "온천천" }]);
    expect(got).toEqual({ objectIds: ["UP-614"], names: ["만덕지하차도", "온천천"] });
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `X-${i}` }));
    expect(objectRefsOf(many).objectIds).toHaveLength(50);
    expect(objectRefsOf(undefined)).toEqual({ objectIds: [], names: [] });
  });
});
