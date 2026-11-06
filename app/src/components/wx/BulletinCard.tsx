"use client";
import { parseStatusBars, type WxBulletin } from "@/lib/wxBulletin";
import { advTime } from "@/lib/wxref";

/**
 * 기상특보 통보문 한 장 (개발 서버 nia_ai-frontend BulletinCard 를 옮김) — 기상청이 적어 보낸 칸을 늘 같은 틀로 나눠 보인다.
 * 머리(지점·특보해당구역·발표번호·발표시각) → 제목 → 칸(발효시각·해당구역) → 특보발효현황 → 내용 → 예비특보 → 참고사항.
 * 특보발효현황은 종류별 구역 수 막대(개발 서버와 같이, 사용자 결정 2026-11-06 「개발서버대로」) — 글에 적힌 구역을 세기만 한다(lib/wxBulletin parseStatusBars).
 * 그 꼴(「o 종류 : 구역, 구역」)이 아니면 막대 없이 글 그대로. 막대는 파랑, 경보 종류 이름만 빨강. 그 밖의 칸은 받은 글 그대로
 * 내용(t4)이 비어 오는 일이 흔하다 — 숨기면 「못 받은 것」으로 읽히므로 그 사실을 적는다
 */
export default function BulletinCard({ b }: { b: WxBulletin }) {
  const text = (v: string) => v.trim() || null;
  const bars = parseStatusBars(b.statusText);
  const max = Math.max(1, ...bars.map((r) => r.areas.length));
  return (
    <article className="bc">
      <p className="bc-cond">
        {[b.stnName, b.areaLabel, `제${b.seq}호`].filter(Boolean).join(" · ")} · {advTime(b.announcedAt)} 발표
      </p>
      <h4 className="bc-title">{b.title}</h4>
      <dl className="bc-fields">
        {text(b.effectiveText) && (
          <div>
            <dt>발효시각</dt>
            <dd>{b.effectiveText}</dd>
          </div>
        )}
        {text(b.areas) && (
          <div>
            <dt>해당구역</dt>
            <dd>{b.areas}</dd>
          </div>
        )}
        {text(b.statusText) && (
          <div>
            <dt>특보발효현황{b.statusAt ? ` (${advTime(b.statusAt)} 기준)` : ""}</dt>
            {bars.length > 0 ? (
              <dd>
                <ul className="bc-bars">
                  {bars.map((r, i) => (
                    <li key={`${r.kind}-${i}`} className="bc-bar">
                      <span className={`bc-kind${/경보/.test(r.kind) ? " alarm" : ""}`}>{r.kind}</span>
                      <span className="bc-track" aria-hidden="true">
                        <span className="bc-fill" style={{ width: `${(r.areas.length / max) * 100}%` }} />
                      </span>
                      <span className="bc-val">{r.areas.length}개 구역</span>
                      <span className="bc-areas">{r.areas.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            ) : (
              <dd>{b.statusText}</dd>
            )}
          </div>
        )}
        <div>
          <dt>내용</dt>
          <dd className={text(b.body) ? "" : "none"}>{text(b.body) ?? "기상청이 덧붙인 내용이 없습니다."}</dd>
        </div>
        {text(b.preliminary) && (
          <div>
            <dt>예비특보</dt>
            <dd>{b.preliminary}</dd>
          </div>
        )}
        {text(b.note) && (
          <div>
            <dt>참고사항</dt>
            <dd>{b.note}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}
