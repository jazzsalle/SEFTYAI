"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem } from "@/lib/server/catalog";
import { IcStar } from "@/components/Icons";

interface Res { summary: { datasets: number; riskObjects: number; events: number; reports119: number; manualTasks: number }; items: CatalogItem[] }

const GAPS = [
  { k: "강우-피해 결합 (T3Q 기상결합 · 시연 가정)", t: "기상특보에는 강우량이 없음 → T3Q가 사건 기간·시군구로 기상청 ASOS 시간강수를 결합해 제공하는 것으로 가정하고 33개 사건 전체에 시연값을 적재. 실연계 시 T3Q 결합값으로 교체", who: "T3Q", q: "비슷한 강우 때 과거에 어디가 침수됐나요?" },
  { k: "급경사지 전체 대장", t: "NDMS 급경사지 원천 테이블은 50행 샘플만 수신 → 붕괴위험지역 정비계획으로 대체 중. 재해위험도 평가(등급·점수) 원천 결합 필요", who: "행안부 · T3Q", q: "부산 급경사지는 어디 있고, 왜·언제 위험한가요?" },
  { k: "건축물 지하공간", t: "실데이터 미수신 — 건축HUB 표제부·층별개요 + 건물 GIS 결합 후 하천 인근(예: 100m) 지하층 보유 건물 표출", who: "행안부(세움터)", q: "하천 인근 지하공간이 있는 건축물은?" },
  { k: "119 신고 실데이터", t: "소방긴급구조정보 표준 21개 항목 구조는 반영, 실값은 '신고내용' 마스킹 유통 → 풍수해 필터링·요약 가공 범위 협의 필요(국조실 협력과제)", who: "소방청 · 행안부", q: "이번 사건으로 접수된 119 신고 내용은 무엇인가요?" },
  { k: "좌표 미보유 객체", t: "754개 객체는 원천 좌표가 없어 읍면동 내 근사 배치(위치 근사 표시) → 지번 지오코딩 또는 원천 좌표 결합 필요", who: "T3Q", q: "" },
  { k: "재해대장 ↔ 사건명 별칭", t: "2020.7.23 부산 호우 등 일부 사건은 재해대장 재난명과 일치하지 않음 → 사건 별칭(alias) 표를 T3Q와 합의(D-15)", who: "T3Q", q: "2020년 7월 23일 부산 호우 때 무슨 일이 있었나요?" },
];

export default function CatalogPage() {
  const [d, setD] = useState<Res | null>(null);
  const router = useRouter();
  useEffect(() => {
    fetch("/api/catalog").then((r) => r.json()).then(setD);
  }, []);
  return (
    <div className="page">
      <div className="page-in">
        <div className="ph">
          <div>
            <h1>데이터 출처 · 반영 현황</h1>
            <p>발주처(행안부) 제공 ★ 데이터가 서비스의 어느 화면·답변에 쓰이는지, 아직 연계가 필요한 부분은 무엇인지 보여드립니다.</p>
          </div>
        </div>
        {d && (
          <div className="grid3" style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 20 }}>
            {[["연계 데이터셋", d.summary.datasets, "종"], ["위험·취약 객체", d.summary.riskObjects.toLocaleString(), "곳"], ["재난사건(재난마스터)", d.summary.events, "건"], ["119 신고(표준 구조)", d.summary.reports119, "건"], ["매뉴얼 조치 항목", d.summary.manualTasks, "개"]].map(([l, v, u]) => (
              <div key={l as string} className="fact"><div className="l">{l}</div><div className="v">{v}<small>{u}</small></div></div>
            ))}
          </div>
        )}
        <table className="tbl">
          <thead>
            <tr><th style={{ width: 34 }} /><th>데이터</th><th>제공</th><th style={{ width: 110 }}>레코드</th><th>지역별</th><th>쓰이는 곳</th><th style={{ width: 80 }}>상태</th></tr>
          </thead>
          <tbody>
            {d?.items.map((it) => (
              <tr key={it.key}>
                <td>{it.star && <span title="발주처 지정 필수 반영 자료" style={{ color: "#e0a83c" }}><IcStar size={18} /></span>}</td>
                <td><b>{it.name}</b><div className="xs mute2" style={{ marginTop: 2 }}>{it.folder}</div><div className="xs muted" style={{ marginTop: 4 }}>{it.note}</div></td>
                <td className="xs">{it.provider}</td>
                <td className="num">{it.records ? it.records.toLocaleString() : "실시간"}</td>
                <td className="xs">{Object.entries(it.byRegion).map(([k, v]) => <div key={k}>{k.replace("(16개 구·군)", "")} {v.toLocaleString()}</div>)}</td>
                <td>{it.usedIn.map((u) => <span key={u} className="badge info" style={{ margin: "0 4px 4px 0", height: "auto", padding: "3px 8px", whiteSpace: "normal" }}>{u}</span>)}</td>
                <td><span className={`badge ${it.status === "반영" ? "ok" : it.status === "샘플" ? "warn" : "neutral"}`}>{it.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: 20, margin: "36px 0 12px" }}>더 좋은 답을 위해 연계가 필요한 것</h2>
        <div className="grid2">
          {GAPS.map((g) => (
            <div key={g.k} className="panel">
              <div className="row"><b>{g.k}</b><span className="sp" /><span className="badge neutral">{g.who}</span></div>
              <p className="xs muted" style={{ lineHeight: 1.7, margin: "8px 0 0" }}>{g.t}</p>
              {g.q && <button className="btn xs line" style={{ marginTop: 10 }} onClick={() => router.push(`/explore?q=${encodeURIComponent(g.q)}`)}>현재 답변 확인 ›</button>}
            </div>
          ))}
        </div>
        <p className="xs mute2" style={{ marginTop: 20, lineHeight: 1.8 }}>
          · 매뉴얼 내 개인정보는 공개 문서이므로 민감정보로 취급하지 않으나(발주처 의견), 비상연락망·전화번호는 표출하지 않습니다.<br />
          · 공무원용/대국민용 구분 : 지하차도 담당자 지정 등 개인정보 항목은 공무원용에서만 제공하도록 설계했습니다.
        </p>
      </div>
    </div>
  );
}
