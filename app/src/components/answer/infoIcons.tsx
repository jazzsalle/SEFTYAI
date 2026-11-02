import type { ReactElement, ReactNode } from "react";

// 정보 카드용 단색 선 아이콘 세트 (색은 부모의 currentColor를 따름)
export type IconProps = { size?: number; className?: string; title?: string };

// 공통 svg 래퍼
function Base({
  size = 24,
  className,
  title,
  children,
}: IconProps & { children: ReactNode }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={className}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// 강한 면 강조용 공통 속성
const ACCENT = { fill: "currentColor", opacity: 0.18, stroke: "none" } as const;

// 비구름과 빗줄기
export function IcRain(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M9 18a5 5 0 0 1 .6-9.9A7 7 0 0 1 23 10a4.2 4.2 0 0 1 0 8z" />
      <path d="M11 22l-2 4M17 22l-2 4M23 22l-2 4" />
    </Base>
  );
}

// 굽이치는 하천 물결
export function IcRiver(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M3 10c3-3 5 3 8 0s5 3 8 0 5 3 10 0" />
      <path d="M3 17c3-3 5 3 8 0s5 3 8 0 5 3 10 0" />
      <path d="M3 24c3-3 5 3 8 0s5 3 8 0 5 3 10 0" />
    </Base>
  );
}

// 바다 만조: 파도와 위로 화살표
export function IcTide(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M16 12V3M12 7l4-4 4 4" />
      <path d="M3 18c3-3 5 3 8 0s5 3 8 0 5 3 10 0" />
      <path d="M3 25c3-3 5 3 8 0s5 3 8 0 5 3 10 0" />
    </Base>
  );
}

// 지하차도: U자 도로 단면과 차
export function IcUnderpass(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M3 6h26" />
      <path d="M5 6v8c0 5 3 10 11 10s11-5 11-10V6" />
      <path d="M11 20v-3h10v3z" {...ACCENT} />
      <path d="M11 20v-3l2-2h6l2 2v3z" />
      <circle cx="13.5" cy="21" r="1" />
      <circle cx="18.5" cy="21" r="1" />
    </Base>
  );
}

// 배수 펌프: 펌프와 물방울
export function IcPump(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <circle cx="12" cy="17" r="7" />
      <circle cx="12" cy="17" r="2.5" {...ACCENT} />
      <path d="M12 10V6h8" />
      <path d="M24 9c-1.5 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.5-2-2-4z" />
      <path d="M8 27h8" />
    </Base>
  );
}

// 수문·차단기: 내려진 차단봉
export function IcGate(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M6 26V10" />
      <rect x="3" y="24" width="8" height="3" rx="1" {...ACCENT} />
      <path d="M6 14h22v5H6z" />
      <path d="M12 14l-3 5M18 14l-3 5M24 14l-3 5" />
      <circle cx="6" cy="8" r="2" />
    </Base>
  );
}

// 급경사지·산사태: 비탈과 미끄러지는 흙
export function IcSlope(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M3 27L19 7l10 20z" {...ACCENT} />
      <path d="M3 27L19 7l10 20z" />
      <path d="M8 14l5 3M14 10l-1 0" />
      <circle cx="22" cy="19" r="1.6" />
      <circle cx="17" cy="23" r="1.3" />
      <path d="M11 20l3 2" />
    </Base>
  );
}

// 침수 주택: 집과 물결
export function IcHouseFlood(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M4 15L16 5l12 10" />
      <path d="M7 13v7M25 13v7" />
      <path d="M2 22c3-2.5 5 2.5 7 0s5 2.5 7 0 5 2.5 7 0 5 2.5 7 0" />
      <path d="M2 28c3-2.5 5 2.5 7 0s5 2.5 7 0 5 2.5 7 0 5 2.5 7 0" />
      <rect x="13" y="14" width="6" height="5" {...ACCENT} />
    </Base>
  );
}

// 대피: 달리는 사람과 화살표
export function IcEvacuate(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <circle cx="15" cy="7" r="2.5" {...ACCENT} />
      <circle cx="15" cy="7" r="2.5" />
      <path d="M15 11l-3 7 5 3-1 6" />
      <path d="M12 18l-5 2M15 12l5 3 3-1" />
      <path d="M12 18l-2 9" />
      <path d="M23 24h6M26 21l3 3-3 3" />
    </Base>
  );
}

// 재난문자: 휴대전화와 말풍선
export function IcSms(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <rect x="4" y="9" width="12" height="20" rx="2.5" />
      <path d="M9 25h2" />
      <path d="M13 3h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4 3v-3h-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" {...ACCENT} />
      <path d="M13 3h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4 3v-3h-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M20 6v3M20 11.2v.2" />
    </Base>
  );
}

// 교통통제: 도로 차단 표지
export function IcRoadBlock(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <circle cx="16" cy="13" r="10" {...ACCENT} />
      <circle cx="16" cy="13" r="10" />
      <path d="M9 13h14" />
      <path d="M16 23v6M10 29h12" />
    </Base>
  );
}

// 언론 보도: 신문
export function IcNews(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M6 5h17v21H8a2 2 0 0 1-2-2z" />
      <path d="M23 11h4v13a2 2 0 0 1-2 2h-2" />
      <rect x="10" y="9" width="9" height="5" {...ACCENT} />
      <path d="M10 18h9M10 22h9" />
    </Base>
  );
}

// 피해 복구: 삽과 망치
export function IcRecovery(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M22 4l6 6-3 3-6-6z" {...ACCENT} />
      <path d="M22 4l6 6-3 3-6-6z" />
      <path d="M21 11L8 24" />
      <path d="M5 27l3-3" />
      <path d="M5 8l5-4 3 3-4 5z" />
      <path d="M11 11l11 11" />
      <path d="M22 22l4 4" />
    </Base>
  );
}

// 캠핑장: 텐트
export function IcCamp(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M3 26L16 6l13 20z" {...ACCENT} />
      <path d="M3 26L16 6l13 20z" />
      <path d="M16 6v20" />
      <path d="M16 14l-5 12M16 14l5 12" />
      <path d="M2 26h28" />
    </Base>
  );
}

// 수위계·관측소: 눈금 기둥
export function IcGauge(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <rect x="11" y="3" width="8" height="24" rx="1.5" />
      <path d="M11 8h4M11 13h4M11 18h4" />
      <path d="M11 20h8v7h-8z" {...ACCENT} />
      <path d="M3 22c2-2 3 2 5 0M24 22c2-2 3 2 5 0" />
      <path d="M3 29h26" />
    </Base>
  );
}

// 사건 날짜: 달력
export function IcCalendar(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <rect x="4" y="6" width="24" height="22" rx="3" />
      <path d="M4 13h24" />
      <path d="M10 3v5M22 3v5" />
      <rect x="17" y="17" width="6" height="6" rx="1" {...ACCENT} />
      <path d="M9 18h3M9 23h3M17 18h6" />
    </Base>
  );
}

// 지도 지점: 핀
export function IcMapPin(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M16 29s-9-8-9-15a9 9 0 0 1 18 0c0 7-9 15-9 15z" {...ACCENT} />
      <path d="M16 29s-9-8-9-15a9 9 0 0 1 18 0c0 7-9 15-9 15z" />
      <circle cx="16" cy="14" r="3.2" />
    </Base>
  );
}

// 취약시설: 건물
export function IcFacility(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <rect x="6" y="5" width="14" height="22" rx="1.5" />
      <path d="M20 13h6v14h-6" />
      <path d="M10 10h2M14 10h2M10 15h2M14 15h2M10 20h2M14 20h2" />
      <path d="M23 18h.1M23 22h.1" />
      <path d="M3 27h26" />
      <rect x="6" y="5" width="14" height="4" {...ACCENT} />
    </Base>
  );
}

// 특보: 삼각형 느낌표
export function IcWarning(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <path d="M16 4L2.5 27h27z" {...ACCENT} />
      <path d="M16 4L2.5 27h27z" />
      <path d="M16 12v7" />
      <path d="M16 23.2v.2" />
    </Base>
  );
}

// 위험개선지구: 지역 경계(점선 사각)와 핀
export function IcLandmark(p: IconProps): ReactElement {
  return (
    <Base {...p}>
      <rect x="3" y="5" width="26" height="22" rx="2" strokeDasharray="3 3" />
      <path d="M16 22s-5-4.2-5-8.2a5 5 0 0 1 10 0c0 4-5 8.2-5 8.2z" {...ACCENT} />
      <path d="M16 22s-5-4.2-5-8.2a5 5 0 0 1 10 0c0 4-5 8.2-5 8.2z" />
      <circle cx="16" cy="13.8" r="1.6" />
    </Base>
  );
}

// 한글 키 → 아이콘 매핑
export const INFO_ICONS: Record<string, (p: IconProps) => ReactElement> = {
  강우: IcRain,
  하천: IcRiver,
  만조: IcTide,
  지하차도: IcUnderpass,
  펌프: IcPump,
  수문: IcGate,
  급경사지: IcSlope,
  침수: IcHouseFlood,
  대피: IcEvacuate,
  재난문자: IcSms,
  교통통제: IcRoadBlock,
  언론: IcNews,
  복구: IcRecovery,
  캠핑장: IcCamp,
  관측소: IcGauge,
  날짜: IcCalendar,
  지점: IcMapPin,
  시설: IcFacility,
  특보: IcWarning,
  위험지구: IcLandmark,
};
