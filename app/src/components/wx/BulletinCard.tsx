"use client";
import type { WxBulletin } from "@/lib/wxBulletin";
import { advTime } from "@/lib/wxref";

/**
 * 기상특보 통보문 한 장 (개발 서버 nia_ai-frontend BulletinCard 를 옮김) — 기상청이 적어 보낸 칸을 늘 같은 틀로 나눠 보인다.
 * 머리(지점·특보해당구역·발표번호·발표시각) → 제목 → 칸(발효시각·해당구역) → 특보발효현황 → 내용 → 예비특보 → 참고사항.
 * 글은 받은 그대로(R25). 개발 서버 카드의 「종류별 구역 수 막대」는 유엔이가 센 값이라 옮기지 않았다 — 특보발효현황은 글 그대로.
 * 내용(t4)이 비어 오는 일이 흔하다 — 숨기면 「못 받은 것」으로 읽히므로 그 사실을 적는다
 */
export default function BulletinCard({ b }: { b: WxBulletin }) {
  const text = (v: string) => v.trim() || null;
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
            <dd>{b.statusText}</dd>
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
