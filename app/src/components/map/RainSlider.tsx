"use client";
/**
 * 「비가 이만큼 오면」 — 지도 아래 강우 막대(김인건 서기관 제안 2026-11-25, 샘플).
 *
 * 일강수량을 올리면 막대가 오른쪽으로 가고, 그 비보다 적게 와도 119 신고·피해가 있었던 과거 날이
 * 카드와 지도 핀으로 이어 나온다. 기관장 보고 때 「지금 비가 과거 어느 피해 때만큼 왔는가」를 한 화면에서 보이려는 것.
 *
 * 데이터는 lib/rainMatch 샘플(T3Q 에 물어 받은 답의 숫자 그대로 — 영천시). 핀은 T3Q 가 준 법정리 코드가 있는 곳만,
 * EXT-01 도형(리 중심점)을 받아 찍는다. 받은 값만 보이고 새 값을 만들지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type OlMap from "ol/Map";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { fromLonLat } from "ol/proj";
import { boundingExtent } from "ol/extent";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";
import { api } from "@/lib/api";
import { scaledPx } from "@/lib/fontScale";
import { matchCases, rainSampleFor, reportTotal, type RainCase, type RainPlace } from "@/lib/rainMatch";

/** 119 신고 = 파랑, 피해 = 갈색(그래프 빨강 금지 — 화면 원칙) */
const REPORT = "#256ef4";
const DAMAGE = "#8a5a2b";
/** 막대 아래 눈금 글(mm) */
const SCALE = [0, 50, 100, 150];

type Pt = { lon: number; lat: number };
const geoCache = new Map<string, Promise<Map<string, Pt>>>();

/** 법정리 코드 → 중심점(EXT-01). 한 지역 샘플마다 한 번 */
function placePoints(key: string, places: RainPlace[]): Promise<Map<string, Pt>> {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const items = places.map((p) => ({ ref: p.code, key: "legal_dong_code", value: p.code }));
  const pending = api<{ envelope: { result?: { features?: { geometry: { type: string; coordinates: unknown }; properties: { value?: string } }[] } } }>("/api/t3q/geometry", {
    method: "POST",
    json: { items },
  })
    .then((r) => {
      const out = new Map<string, Pt>();
      for (const ft of r.envelope.result?.features ?? []) {
        const v = ft.properties.value;
        if (v && ft.geometry.type === "Point") {
          const [lon, lat] = ft.geometry.coordinates as number[];
          out.set(v, { lon, lat });
        }
      }
      return out;
    })
    .catch(() => {
      geoCache.delete(key);
      return new Map<string, Pt>();
    });
  geoCache.set(key, pending);
  return pending;
}

const fmtDate = (d: string) => d.replace(/^(\d{4})-0?(\d{1,2})-0?(\d{1,2})$/, "$1.$2.$3.");
const pinsOf = (c: RainCase) => [
  ...(c.reports?.pins ?? []).map((place) => ({ kind: "report" as const, place })),
  ...c.damages.flatMap((d) => (d.place ? [{ kind: "damage" as const, place: d.place }] : [])),
];

export default function RainSlider({ map, region }: { map: OlMap | null; region: string }) {
  const sample = rainSampleFor(region);
  const [open, setOpen] = useState(false);
  const [mm, setMm] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pts, setPts] = useState<Map<string, Pt> | null>(null);
  const max = sample?.max ?? 200;
  const matched = useMemo(() => (sample ? matchCases(sample.cases, mm) : []), [sample, mm]);
  const top = matched.at(-1) ?? null;
  const nDamage = matched.reduce((a, c) => a + c.damages.length, 0);

  // 리 중심점 — 열 때 한 번
  useEffect(() => {
    if (!open || !sample) return;
    let alive = true;
    const uniq = [...new Map(sample.cases.flatMap(pinsOf).map((p) => [p.place.code, p.place])).values()];
    placePoints(sample.key, uniq).then((m) => alive && setPts(m));
    return () => {
      alive = false;
    };
  }, [open, sample]);

  // 재생 — 0 에서 끝까지 비를 올린다(보고 때 한 번에 보여 주기)
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setMm((v) => {
        const n = Math.min(max, v + 2);
        if (n >= max) setPlaying(false);
        return n;
      });
    }, 80);
    return () => window.clearInterval(t);
  }, [playing, max]);

  // 지도 겹 — 맞는 날의 신고(파랑)·피해(갈색) 핀. 가장 가까운 날은 진하게
  const [layer, setLayer] = useState<VectorLayer<VectorSource> | null>(null);
  useEffect(() => {
    if (!map || !open) return;
    const l = new VectorLayer({ source: new VectorSource(), zIndex: 40 });
    map.addLayer(l);
    setLayer(l);
    return () => {
      map.removeLayer(l);
      setLayer(null);
    };
  }, [map, open]);

  useEffect(() => {
    if (!layer || !pts) return;
    const src = layer.getSource()!;
    src.clear(true);
    // 같은 리에 여러 날이 겹치면 한 핀에 개수로
    const bucket = new Map<string, { kind: "report" | "damage"; place: RainPlace; n: number; strong: boolean }>();
    for (const c of matched) {
      for (const p of pinsOf(c)) {
        const k = `${p.kind}|${p.place.code}`;
        const b = bucket.get(k) ?? { ...p, n: 0, strong: false };
        b.n += 1;
        b.strong ||= c === top;
        bucket.set(k, b);
      }
    }
    for (const b of bucket.values()) {
      const p = pts.get(b.place.code);
      if (!p) continue;
      const color = b.kind === "report" ? REPORT : DAMAGE;
      // 신고와 피해가 같은 리면 피해 핀을 조금 비켜 둔다
      const dx = b.kind === "damage" ? 16 : 0;
      const ft = new Feature({ geometry: new Point(fromLonLat([p.lon, p.lat])) });
      ft.setStyle([
        new Style({
          image: new CircleStyle({ radius: b.strong ? 11 : 8, displacement: [dx, 0], fill: new Fill({ color: b.strong ? color : `${color}99` }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
          text: new Text({ text: b.kind === "report" ? "119" : "피해", offsetX: dx, font: `700 ${scaledPx(9)}px "Pretendard GOV", sans-serif`, fill: new Fill({ color: "#fff" }) }),
        }),
        new Style({
          text: new Text({
            text: b.place.name.replace(/^임고면 /, ""), offsetX: dx, offsetY: b.strong ? 21 : 18, font: `600 ${scaledPx(11)}px "Pretendard GOV", sans-serif`,
            fill: new Fill({ color: "#131416" }), backgroundFill: new Fill({ color: "rgba(255,255,255,0.9)" }), padding: [1, 4, 1, 4],
          }),
        }),
      ]);
      src.addFeature(ft);
    }
  }, [layer, matched, top, pts]);

  // 처음 열 때 핀 자리 전체가 보이게 맞춤(막대가 아래를 가리니 아래 여백을 크게)
  const fitted = useRef(false);
  useEffect(() => {
    if (!open) fitted.current = false;
    if (!map || !open || !pts || fitted.current || pts.size === 0) return;
    fitted.current = true;
    const ext = boundingExtent([...pts.values()].map((p) => fromLonLat([p.lon, p.lat])));
    map.getView().fit(ext, { padding: [70, 90, 260, 90], maxZoom: 13, duration: 300 });
  }, [map, open, pts]);

  if (!sample) return null;
  if (!open)
    return (
      <button type="button" className="rain-open" onClick={() => setOpen(true)}>
        비가 이만큼 오면
      </button>
    );

  return (
    <section className="rain-bar" aria-label="비가 이만큼 오면 — 강우량에 맞춘 과거 119 신고·피해">
      <header className="rain-head">
        <strong>비가 이만큼 오면</strong>
        <span>{sample.basis}</span>
        <em className="rain-tag">샘플</em>
        <button type="button" className="rain-x" onClick={() => { setOpen(false); setPlaying(false); }} aria-label="닫기">×</button>
      </header>
      <div className="rain-row">
        <button type="button" className="rain-play" onClick={() => { if (!playing && mm >= max) setMm(0); setPlaying((v) => !v); }} aria-pressed={playing}>
          {playing ? "멈춤" : "▶ 비 올리기"}
        </button>
        <div className="rain-track">
          <input
            type="range" min={0} max={max} step={1} value={mm}
            onChange={(e) => { setPlaying(false); setMm(Number(e.target.value)); }}
            aria-label="일강수량(mm)"
            style={{ ["--p" as string]: `${(mm / max) * 100}%` }}
          />
          {/* 과거 날 눈금 — 그날의 일강수량 자리. 피해가 있던 날은 갈색 */}
          <ol className="rain-ticks" aria-hidden="true">
            {sample.cases.map((c) => (
              <li key={c.id} className={`${c.dayMm <= mm ? "is-on" : ""}${c.damages.length ? " is-damage" : ""}`} style={{ left: `${(c.dayMm / max) * 100}%` }} title={`${fmtDate(c.date)} 일 ${c.dayMm}mm`} />
            ))}
          </ol>
          <ol className="rain-scale" aria-hidden="true">
            {SCALE.map((v) => (
              <li key={v} style={{ left: `${(v / max) * 100}%` }}>{v}</li>
            ))}
          </ol>
        </div>
        <output className="rain-now">
          일 <b>{mm}</b>mm
        </output>
      </div>
      <p className="rain-sum" role="status">
        {matched.length === 0
          ? "이 비보다 적게 와서 신고·피해가 있었던 날은 아직 없습니다."
          : `이 비보다 적게 와도 119 신고·피해가 있었던 날 ${matched.length}일 · 119 신고 ${reportTotal(matched)}건${nDamage ? ` · 임고면 피해 ${nDamage}건` : ""}`}
        <span className="rain-key"><i style={{ background: REPORT }} />119 신고 <i style={{ background: DAMAGE }} />피해</span>
      </p>
      {matched.length > 0 && (
        <ol className="rain-cards">
          {[...matched].reverse().map((c) => (
            <Card key={c.id} c={c} strong={c === top} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Card({ c, strong }: { c: RainCase; strong: boolean }) {
  return (
    <li className={`rain-card${strong ? " is-top" : ""}${c.damages.length ? " is-damage" : ""}`}>
      <p className="rain-card-h">
        <b>{fmtDate(c.date)}</b> {c.name}
      </p>
      <p className="rain-card-r">
        일 {c.dayMm}mm{c.hourMm != null && ` · 1시간 ${c.hourMm}mm`}{c.totalMm != null && ` · ${c.totalNote ?? "누적"} ${c.totalMm}mm`}
      </p>
      {c.damages.map((d, i) => (
        <p key={i} className="rain-card-d"><i style={{ background: DAMAGE }} />{d.place ? `${d.place.name} — ${d.text}` : d.text}</p>
      ))}
      {c.reports && (
        <p className="rain-card-d rain-card-places" title={c.reports.places}>
          <i style={{ background: REPORT }} />
          <span>119 신고 <b>{c.reports.count}건</b> · {c.reports.places}</span>
        </p>
      )}
    </li>
  );
}
