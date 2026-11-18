"use client";
import { useState } from "react";
import { parseStatusBars, type WxBulletin } from "@/lib/wxBulletin";

/** 2026.11.06 21:00(개발서버 BulletinCard dateTime) */
const fullTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const text = (v: string | null | undefined) => v?.trim() || null;

/**
 * 기상특보 통보문 한 장 — 개발서버 BulletinCard 그대로(2026-11-19 「개발서버와 동일하게」).
 * 머리(지점·특보해당구역·발표번호·발표시각) → 제목 → 타일(발표번호·발효시각·해당구역) → 특보발효현황(종류별 구역 수 막대 — lib/wxBulletin parseStatusBars,
 * 그 꼴이 아니면 글 그대로) → 내용(비어 오면 그 사실을 적는다) → 예비특보 → 참고사항 → [원문 보기]·자료 출처
 */
const AGENCY = "기상청";
export default function BulletinCard({ b }: { b: WxBulletin }) {
  const [raw, setRaw] = useState(false);
  const bars = parseStatusBars(b.statusText);
  const max = Math.max(1, ...bars.map((r) => r.areas.length));
  return (
    <article className="bc">
      <p className="bc-cond">
        {[b.stnName, b.areaLabel, `제${b.seq}호`].filter(Boolean).join(" · ")}
        {fullTime(b.announcedAt) && ` · 발표 ${fullTime(b.announcedAt)}`}
      </p>
      <h4 className="bc-title">{b.title}</h4>

      <dl className="bc-tiles">
        <div className="bc-tile">
          <dt>발표번호</dt>
          <dd><b>{b.seq}</b>호</dd>
        </div>
        {text(b.effectiveText) && (
          <div className="bc-tile">
            <dt>발효시각</dt>
            <dd className="bc-tile-text">{text(b.effectiveText)}</dd>
          </div>
        )}
        {text(b.areas) && (
          <div className="bc-tile bc-tile--wide">
            <dt>해당구역</dt>
            <dd className="bc-tile-text">{text(b.areas)}</dd>
          </div>
        )}
      </dl>

      {(bars.length > 0 || text(b.statusText)) && (
        <section className="bc-block">
          <h5 className="bc-block-title">
            특보발효현황
            {b.statusAt && <span className="bc-block-sub">{fullTime(b.statusAt)} 기준</span>}
          </h5>
          {bars.length > 0 ? (
            <ul className="bc-bars">
              {bars.map((r, i) => (
                <li key={`${r.kind}-${i}`} className="bc-bar">
                  <span className={`bc-kind${/경보/.test(r.kind) ? " bc-kind--alarm" : ""}`}>{r.kind}</span>
                  <span className="bc-bar-track" aria-hidden="true">
                    <span className="bc-bar-fill" style={{ width: `${(r.areas.length / max) * 100}%` }} />
                  </span>
                  <span className="bc-bar-value">{r.areas.length}개 구역</span>
                  <span className="bc-bar-areas">{r.areas.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bc-text">{text(b.statusText)}</p>
          )}
        </section>
      )}

      <section className="bc-block">
        <h5 className="bc-block-title">내용</h5>
        {/* 비어 오는 일이 흔하다 — 숨기면 「못 받은 것」으로 읽히므로 그 사실을 적는다 */}
        <p className={text(b.body) ? "bc-text" : "bc-text bc-text--none"}>{text(b.body) ?? "기상청이 덧붙인 내용이 없습니다."}</p>
      </section>

      {text(b.preliminary) && (
        <section className="bc-block bc-block--pre">
          <h5 className="bc-block-title">예비특보</h5>
          <p className="bc-text">{text(b.preliminary)}</p>
        </section>
      )}

      {text(b.note) && (
        <section className="bc-block">
          <h5 className="bc-block-title">참고사항</h5>
          <p className="bc-text">{text(b.note)}</p>
        </section>
      )}

      <div className="bc-foot">
        <button type="button" className="bc-toggle" aria-expanded={raw} onClick={() => setRaw((v) => !v)}>
          {raw ? "원문 접기" : "원문 보기"}
        </button>
        <span className="bc-source">자료: 기상청 기상특보 통보문 · {AGENCY} {b.stnName}</span>
      </div>

      {raw && (
        <dl className="wx-msg-fields bc-raw">
          <Field label="제목" value={b.title} />
          <Field label="해당구역" value={b.areas} />
          <Field label="발효시각" value={b.effectiveText} />
          <Field label="내용" value={b.body} />
          <Field label={b.statusAt ? `특보발효현황 (${fullTime(b.statusAt)})` : "특보발효현황"} value={b.statusText} />
          <Field label="예비특보" value={b.preliminary} />
          <Field label="참고사항" value={b.note} />
        </dl>
      )}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const t = text(value);
  if (!t) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd className="wx-msg-text">{t}</dd>
    </>
  );
}
