"use client";
import { useState } from "react";
import type { PreviewItem } from "@/lib/jobTypes";
import { fieldKo, VALUE_KO } from "@/lib/labels";
import { useT3qDataMany, type T3qDataState, type T3qEnvelope } from "@/lib/t3qData";
import { useExplore } from "@/components/explore/ExploreCtx";
import { Gaps } from "@/components/explore/DetailPane";
import { allKeys, CardHead, cellText, DETAIL, pick } from "./GenericCard";
import "./similar.css";

/**
 * 유사재난 사례(SIMILAR_EVENT · 유사사례 검색 T3Q-04) 카드 — 받은 순서 그대로(정렬·거르기·합치기 없음).
 * - 첫 사건은 카드, 둘째부터 줄. 사건마다 받은 값만: 사건 · 시작 ~ 종료(받은 글자, 같아도 둘 다) · 대표지역(이름이 올 때) ·
 *   진행 상태(VALUE_KO) · 순위 · 유사도 점수 · 척도.
 * - 사건 요약(A10): 목록의 사건 전부의 사건 상세(T3Q-10)를 한꺼번에 동시에 받아 result.event_summary 를 받은 그대로.
 *   받는 중 = 회색 줄(글자 없음) · 받지 못함 = 그 줄만 「요약을 불러오지 못했습니다」.
 * - 사건을 누르면 사건 상세(오른쪽 패널) — 표 카드와 같은 호출. 「모든 항목 보기」 = 받은 항목의 키 전부(표, similarity.coverage·대표지역 행정코드 포함).
 * - 제공처 경고·정보 부족은 표 카드와 같이 받은 문구 그대로(Gaps).
 */

type Item = Record<string, unknown>;
type DetailState = T3qDataState<T3qEnvelope>;

const DET = DETAIL["T3Q-04"] ?? { api: "T3Q-10", idKey: "event_master_id", nameKey: "display_name" };
const FAIL = "요약을 불러오지 못했습니다";
/** 요약이 비어 와도 「받은 것」으로 보는 봉투 상태 — 그 밖(오류·찾을 수 없음 등)은 받지 못한 것 */
const OK_STATUS = ["SUCCESS", "PARTIAL_SUCCESS"];

const empty = (v: unknown) => v === null || v === undefined || v === "";
/** 받은 값 → 글자. 비었으면 null(그 자리를 두지 않는다) */
const textOrNull = (v: unknown, key?: string) => (empty(v) ? null : cellText(v, false, key));

/** 사건 상세에 보낼 사건 ID — 받은 값 그대로(글자·숫자일 때만) */
function idOf(it: Item): string | null {
  const v = it[DET.idKey];
  if (typeof v === "string" && v !== "") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** 사건 상세 봉투 → 사건 요약 글. 받은 값은 그대로 · 성공 봉투인데 비어 왔으면 「—」 · 그 밖은 null(받지 못함) */
function summaryText(env: T3qEnvelope): string | null {
  const r = env.result;
  const v = r && typeof r === "object" ? (r as Item).event_summary : undefined;
  if (typeof v === "string" && v !== "") return v;
  if (!empty(v)) return cellText(v);
  return r && typeof env.status === "string" && OK_STATUS.includes(env.status) ? "—" : null;
}

/** 목록 응답의 받은 값 — 글자만 맞추고 값은 그대로 */
function fieldsOf(it: Item) {
  const life = it.lifecycle_status;
  return {
    name: cellText(it[DET.nameKey]),
    period: `${cellText(it.started_at)} ~ ${cellText(it.ended_at)}`,
    area: textOrNull(pick("representative_admin_area.name")(it)),
    life: empty(life) ? null : typeof life === "string" ? (VALUE_KO[life] ?? life) : cellText(life),
    rank: textOrNull(pick("similarity.rank")(it), "rank"),
    score: cellText(pick("similarity.score")(it), false, "score"),
    scale: textOrNull(pick("similarity.scale")(it)),
  };
}
type Fields = ReturnType<typeof fieldsOf>;

const metaOf = (f: Fields) => [f.period, f.area === null ? null : `대표지역 ${f.area}`, f.life].filter((x) => x !== null).join(" · ");
const scaleOf = (f: Fields) => (f.scale === null ? "" : ` · 척도 ${f.scale}`);

/** 목록 사건 전부의 사건 상세를 한꺼번에 — items 순서대로 상태(ID 가 없으면 null) */
function useEventDetails(items: Item[]): (DetailState | null)[] {
  const ids = items.map(idOf);
  const got = useT3qDataMany<T3qEnvelope>(DET.api, ids.filter((id): id is string => id !== null));
  let k = 0;
  return ids.map((id) => (id === null ? null : (got[k++] ?? null)));
}

function Summary({ s }: { s: DetailState | null }) {
  if (s?.state === "loading")
    return (
      <div className="sim-sum" aria-busy="true">
        <span className="sim-sk" aria-hidden="true" />
      </div>
    );
  const text = s?.state === "ok" ? summaryText(s.data) : null;
  if (text === null) return <div className="sim-sum sim-fail">{FAIL}</div>;
  return <div className="sim-sum">{text}</div>;
}

export default function SimilarEventsCard({ p }: { p: PreviewItem }) {
  const x = useExplore();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(true);
  const env = p.response;
  // 받은 순서·개수 그대로 — 객체가 아닌 칸은 빈 사건으로 두어(빼지 않음) 화면이 깨지지 않게
  const raw: unknown = env?.result?.items;
  const items: Item[] = Array.isArray(raw) ? raw.map((it) => (it && typeof it === "object" ? (it as Item) : {})) : [];
  // 목록이 오면 사건 전부의 요약을 바로 받는다(접혀 있어도)
  const details = useEventDetails(items);
  // 사건 상세에서 유사도 근거를 같은 조건으로 비교 — 표 카드와 같은 호출
  const ctx = (p.request as { query_context?: Record<string, unknown> } | null)?.query_context ?? null;
  const openEvent = (it: Item) => x.openDetail(DET.api, String(it[DET.idKey]), String(it[DET.nameKey] ?? it[DET.idKey]), ctx);
  const [first, ...rest] = items;

  return (
    <section className="datacard-sec sim">
      <CardHead p={p} open={open} onToggle={() => setOpen((v) => !v)} />
      {open && (
        <>
          {all ? (
            <AllFields items={items} onOpen={openEvent} />
          ) : (
            <>
              {/* 사건 이름(단추)이나 칸 어디를 눌러도 사건 상세 — 단추의 클릭(키보드 Enter·Space 포함)은 칸으로 올라간다 */}
              {first && <TopCard it={first} s={details[0] ?? null} onOpen={() => openEvent(first)} />}
              {rest.length > 0 && (
                <ol className="sim-list">
                  {rest.map((it, j) => {
                    const f = fieldsOf(it);
                    return (
                      <li key={j} className="sim-row" onClick={() => openEvent(it)}>
                        <div className="sim-l1">
                          <button type="button" className="sim-name">{f.name}</button>
                          <span className="sim-meta">{metaOf(f)}</span>
                          <span className="sim-score">
                            {f.rank !== null && `${f.rank}위 · `}유사도 {f.score}
                            {scaleOf(f)}
                          </span>
                        </div>
                        <Summary s={details[j + 1] ?? null} />
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
          {env && <Gaps env={env} />}
          {items.length > 0 && (
            <button type="button" className="lnk xs sim-all" onClick={() => setAll((v) => !v)}>
              {all ? "주요 항목만" : "모든 항목 보기"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function TopCard({ it, s, onOpen }: { it: Item; s: DetailState | null; onOpen: () => void }) {
  const f = fieldsOf(it);
  return (
    <div className="sim-top" onClick={onOpen}>
      <div className="sim-top-h">
        {f.rank !== null && <span className="sim-rank">{f.rank}위</span>}
        <span className="sim-score">
          유사도 <b>{f.score}</b>
          {scaleOf(f)}
        </span>
      </div>
      <button type="button" className="sim-name">{f.name}</button>
      <div className="sim-meta">{metaOf(f)}</div>
      <Summary s={s} />
    </div>
  );
}

/**
 * 모든 항목 보기 — 받은 항목의 키 전부(나오는 순서대로, 한국어 열 이름), 값은 받은 그대로(객체는 키 전부 — 대표지역의 행정코드 등).
 * 사건 이름 칸은 단추 — 키보드로도 사건 상세를 연다(단추의 클릭이 행으로 올라간다)
 */
function AllFields({ items, onOpen }: { items: Item[]; onOpen: (it: Item) => void }) {
  const keys = allKeys(items);
  const btnKey = keys.includes(DET.nameKey) ? DET.nameKey : keys[0];
  return (
    <div className="md-table">
      <table>
        <thead>
          <tr>{keys.map((k) => <th key={k}>{fieldKo(k)}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="clk" onClick={() => onOpen(it)}>
              {keys.map((k) => {
                const text = cellText(it[k], true, k);
                return <td key={k}>{k === btnKey ? <button type="button" className="lnk">{text}</button> : text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
