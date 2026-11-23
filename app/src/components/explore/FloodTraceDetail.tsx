"use client";
import { Fragment } from "react";
import { useT3qData, type T3qEnvelope } from "@/lib/t3qData";
import { floodTraceBody, floodTraceItem, floodTraceRows, isFloodTraceId, type FloodTraceRow } from "@/lib/floodTrace";
import { NO_GEOMETRY, UNAVAILABLE } from "@/lib/riskObject";
import { IcHouseFlood } from "../answer/infoIcons";
import { useExplore } from "./ExploreCtx";
import { MapIcon } from "./EntityDetail";
import "../answer/demoInfo.css";
import "./eventInfo.css";
import "./entity.css";

/** 정의서 UFR-003-001-06 — 값이 비어 온 항목은 「—」로 적는다 */
const EMPTY = "—";

/**
 * 침수흔적 상세 탭(UFR-003-001-06 · FUN-UFR-603001) — 개발서버 FloodTraceTab(a4cb228) 그대로.
 * 침수흔적은 위험·취약 대상 상세(T3Q-15)에 없어 침수흔적 조회(T3Q-30)에서 그 ID 한 건을 받아 받은 값 그대로 보인다.
 * 머리 모양은 위험·취약 대상 상세(EntityDetail)와 같다.
 */
export default function FloodTraceDetail({ id, label, ctx, hasGeometry: known }: { id: string; label: string; ctx?: Record<string, unknown> | null; hasGeometry?: boolean | null }) {
  const x = useExplore();
  const key = isFloodTraceId(id) ? id.trim() : null;
  const q = useT3qData<T3qEnvelope<{ total_count?: number; items?: unknown[] }>>(key ? { api: "T3Q-30", body: floodTraceBody(key) } : null);
  const item = key && q.state === "ok" ? floodTraceItem(q.data.result, key) : null;
  const state: "nokey" | "loading" | "ok" | "none" | "failed" = !key ? "nokey" : q.state === "loading" ? "loading" : q.state === "error" ? "failed" : item ? "ok" : "none";
  const name = item?.district_name?.trim() || label || id;
  const rows = item ? floodTraceRows(item) : null;

  const mapJob = typeof ctx?.mapJob === "string" ? ctx.mapJob : null;
  const mapRef = typeof ctx?.mapRef === "string" ? ctx.mapRef : null;
  const hasGeometry: boolean | null = known !== undefined ? known : mapJob && mapRef ? true : null;

  return (
    <div className="dpane entity-tab evd fadein">
      <header className="evd-hero">
        <span className="evd-hero-ic"><IcHouseFlood size={28} /></span>
        <div className="evd-hero-t">
          <div className="evd-id">{["침수흔적", item?.flood_trace_id ?? key].filter(Boolean).join(" · ")}</div>
          <h2 className="evd-title">{name}</h2>
        </div>
        <div className="entity-head-actions">
          {hasGeometry === true && mapJob && mapRef && (
            <button type="button" className="entity-btn entity-btn--map" onClick={() => x.showOnMap(mapJob, mapRef)}>
              <MapIcon />
              지도에서 보기
            </button>
          )}
        </div>
      </header>

      {hasGeometry === false && <p className="ev-caution">{NO_GEOMETRY}</p>}

      {state === "loading" && <p className="xs muted">상세 정보를 불러오는 중입니다…</p>}
      {state === "nokey" && <p className="xs muted">이 침수흔적은 상세를 조회할 식별자가 없습니다. 지도에서 위치를 볼 수 있습니다.</p>}
      {(state === "none" || state === "failed") && <p className="xs muted">{UNAVAILABLE[state]}</p>}

      {rows && (
        <>
          <section className="ev-sec">
            <h3 className="di-pill">기본정보</h3>
            <FtRows rows={rows.basic} />
          </section>
          <section className="ev-sec">
            <h3 className="di-pill t-b">침수 규모</h3>
            <FtRows rows={rows.scale} />
          </section>
        </>
      )}
    </div>
  );
}

/** 값이 비어 온 줄도 「—」로 남긴다(개발서버 FloodTraceTab Rows — 위험·취약 대상 상세의 Rows 와 달리 줄을 빼지 않음) */
function FtRows({ rows }: { rows: FloodTraceRow[] }) {
  return (
    <dl className="kv ev-kv">
      {rows.map((r) => (
        <Fragment key={r.label}>
          <dt>{r.label}</dt>
          <dd className={r.value === null ? "entity-card-missing" : undefined}>{r.value ?? EMPTY}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
