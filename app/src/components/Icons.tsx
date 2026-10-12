/* 경량 아이콘 (KRDS 라인 스타일 근사) */
type P = { size?: number; className?: string };
const S = ({ size = 16, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);
export const IcSiren = (p: P) => (
  <S {...p}><path d="M7 18v-6a5 5 0 0 1 10 0v6" /><path d="M5 21h14" /><path d="M12 3v2M4.2 7.2l1.4 1.4M19.8 7.2l-1.4 1.4" /></S>
);
export const IcChevR = (p: P) => (<S {...p}><path d="m9 6 6 6-6 6" /></S>);
export const IcChevD = (p: P) => (<S {...p}><path d="m6 9 6 6 6-6" /></S>);
export const IcList = (p: P) => (<S {...p}><path d="M4 6h16M4 12h16M4 18h16" /></S>);
export const IcPlus = (p: P) => (<S {...p}><path d="M12 5v14M5 12h14" /></S>);
export const IcEdit = (p: P) => (<S {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></S>);
export const IcX = (p: P) => (<S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>);
export const IcMap = (p: P) => (<S {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></S>);
export const IcDoc = (p: P) => (<S {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></S>);
export const IcRefresh = (p: P) => (<S {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></S>);
export const IcExpand = (p: P) => (<S {...p}><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></S>);
export const IcPrint = (p: P) => (<S {...p}><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1" /><path d="M7 14h10v7H7z" /></S>);
export const IcPin = (p: P) => (<S {...p}><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></S>);
/** 고정(압정) — 대응절차 단계 바·고정 탭 */
export const IcPushpin = (p: P) => (<S {...p}><path d="M9 3h6l-1 6 3 3H7l3-3z" /><path d="M12 12v9" /></S>);
export const IcClock = (p: P) => (<S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>);
export const IcCheck = (p: P) => (<S {...p}><path d="m5 12 5 5L20 7" /></S>);
export const IcSearch = (p: P) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>);
export const IcLayers = (p: P) => (<S {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></S>);
export const IcPhone = (p: P) => (<S {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></S>);
export const IcStar = (p: P) => (<S {...p}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></S>);
export const IcSpark = (p: P) => (<S {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></S>);

export function GovLogo({ size = 36 }: { size?: number }) {
  // 정부 상징 형태 근사 (태극 곡선) — 시안용
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="정부 상징">
      <circle cx="20" cy="20" r="18" fill="#fff" />
      <path d="M4 20a16 16 0 0 1 32 0c0-4.4-3.6-8-8-8s-8 3.6-8 8-3.6 8-8 8-8-3.6-8-8z" fill="#cd2e3a" />
      <path d="M36 20a16 16 0 0 1-32 0c0 4.4 3.6 8 8 8s8-3.6 8-8 3.6-8 8-8 8 3.6 8 8z" fill="#0047a0" />
      <path d="M4 20c0-2 .6-3.7 1.8-5" stroke="#063a74" strokeWidth="2.2" fill="none" />
    </svg>
  );
}
