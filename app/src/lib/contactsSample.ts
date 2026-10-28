/**
 * 연락망 샘플 — 처음 열 때(빈 연락망)와 [샘플 연락망으로 되돌리기].
 * 실제 사람·번호가 아니라 "이렇게 구성된다"를 보여 주는 예시다. 모든 이름·직위·번호에 [샘플]·0000 을 붙여 샘플임이 드러나게 한다.
 * 구성 = 재난안전대책본부 → 실무반 → 부서 → 담당자 / 유관기관 / 전파 그룹
 */
import type { Bundle, Contact, Group, Unit, UnitKind } from "./contactsCore";

type Seed = { name: string; kind: UnitKind; people?: [title: string, duty: string][]; children?: Seed[] };

const ORG_LABEL: Record<string, { hq: string; teams: [string, string][]; agencies: string[] }> = {
  busan: { hq: "부산광역시 재난안전대책본부", teams: [["상황관리총괄반", "자연재난과"], ["시설응급복구반", "건설행정과"], ["교통대책반", "교통정책과"]], agencies: ["부산경찰청", "부산소방재난본부"] },
  yeongcheon: { hq: "영천시 재난안전대책본부", teams: [["상황관리총괄반", "안전재난하천과"], ["시설응급복구반", "건설과"], ["교통대책반", "교통행정과"]], agencies: ["영천경찰서", "영천소방서"] },
  inje: { hq: "인제군 재난안전대책본부", teams: [["상황관리반", "안전교통과"], ["시설응급복구반", "경제산업과"], ["의료방역지원반", "보건정책과"]], agencies: ["인제경찰서", "인제소방서"] },
  central: { hq: "행정안전부", teams: [["중앙재난안전상황실", "상황실"], ["자연재난대응국", "자연재난대응과"]], agencies: ["국립재난안전연구원"] },
};

function seeds(orgId: string): Seed[] {
  const o = ORG_LABEL[orgId] ?? ORG_LABEL.central;
  return [
    {
      name: o.hq,
      kind: "hq",
      people: [["[샘플] 본부장", "재대본 총괄"], ["[샘플] 통제관", "재난 수습 통제"]],
      children: o.teams.map(([team, dept], i) => ({
        name: team,
        kind: "team" as UnitKind,
        children: [{ name: dept, kind: "dept" as UnitKind, people: i === 0 ? [["[샘플] 과장", "상황 총괄"], ["[샘플] 팀장", "상황보고"], ["[샘플] 주무관", "상황전파"]] : [["[샘플] 팀장", "현장 조치"]] }],
      })),
    },
    { name: "유관기관", kind: "agency", children: o.agencies.map((a) => ({ name: a, kind: "agency" as UnitKind, people: [["[샘플] 상황실", "24시간 상황 접수"]] })) },
  ];
}

/** 샘플 연락망 묶음 — ID 는 기관마다 고정(되돌리기 때 같은 모양) */
export function sampleBundle(orgId: string): Bundle {
  const units: Unit[] = [];
  const contacts: Contact[] = [];
  let u = 0, c = 0;
  const walk = (s: Seed, parentId: string | null, sort: number) => {
    const id = `u${++u}`;
    units.push({ id, orgId, parentId, name: s.name, kind: s.kind, sort });
    (s.people ?? []).forEach(([title, duty], i) => {
      const n = ++c;
      contacts.push({
        id: `c${n}`, orgId, unitId: id, name: `샘플 담당자${n}`, title, duty,
        phone: `010-0000-${String(n).padStart(4, "0")}`, email: `sample${n}@example.invalid`, office: "000-0000-0000", sort: i,
      });
    });
    (s.children ?? []).forEach((ch, i) => walk(ch, id, i));
  };
  seeds(orgId).forEach((s, i) => walk(s, null, i));
  const groups: Group[] = [
    { id: "g1", orgId, name: "[샘플] 상황전파 1차(본부·상황반)", memberIds: contacts.slice(0, 5).map((x) => x.id), sort: 0 },
    { id: "g2", orgId, name: "[샘플] 유관기관", memberIds: contacts.filter((x) => x.duty.startsWith("24시간")).map((x) => x.id), sort: 1 },
  ];
  return { units, contacts, groups };
}
