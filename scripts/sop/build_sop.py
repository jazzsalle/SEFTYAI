"""행동매뉴얼 재난대응 프로세스 표 → 대응절차(SOP) JSON

추출 규칙: report4 `public/api-docs/mapping.html` R1~R25
  대응단계(표의 열 순서, R22) → 임무 [n] → 조치 [n-m] → 세부행동 '-'
  부서 칸(R19)은 표의 행 묶음. 조치 상세(기관·쪽)는 행동카드에서 가져온다(②).
  행동카드 본문은 원문 순서대로 블록(번호 제목·글머리·※·표)으로 모두 담는다 — 표준행동 표(②), 전파 표·표준문안(③),
  지시내용(④). 연락처·성명 열과 실명·전화번호는 뺀다(R17). 카드 뒤 '붙임' 서식은 카드 본문이 아니다.
  카드 짝: 코드+이름 → (못 찾으면) 코드+단계. 프로세스 표에 없는 카드는 그 단계 끝에 붙인다(애매한 경우 규칙).

사용: python -I -X utf8 scripts/sop/build_sop.py <매뉴얼 PDF 폴더> <출력 JSON> [--dump <디버그 폴더>]
"""
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

import pymupdf

STEPS = ["SIGN_DETECTION", "INITIAL_RESPONSE", "EMERGENCY_RESPONSE", "RECOVERY"]
STEP_FILL = {  # 프로세스 표 칸 채움색 → 열(단계)
    (1.0, 1.0, 0.8): 0,
    (0.98, 0.93, 0.82): 1,
    (1.0, 0.8, 0.8): 2,
    (0.88, 0.93, 0.82): 3,
}
GRAY = (0.8, 0.8, 0.8)

MANUALS = [
    {
        "id": "SOP-BUSAN-FLOOD",
        "region": "busan",
        "manualId": "MAN-BUSAN-2026",
        "title": "부산광역시 풍수해(태풍·호우·대설) 재난 현장조치 행동매뉴얼",
        "short": "부산 풍수해 현장조치 행동매뉴얼",
        "file": "(부산) 풍수해 재난 현장조치 행동매뉴얼(26.7.6.)_fn.pdf",
        "offset": 6,  # PDF 쪽 - 인쇄 쪽
        "style": "bracket",  # [n] / [n-m] / -
        "mine": "자연재난과",
        "table": [  # (PDF 쪽, 부서 구분 — 행마다 다르면 목록)
            (40, ["초기대응부서", "지휘부", "지휘부"]),
            (41, "협업부서"),
            (42, "협업부서"),
            (43, "협업부서"),
            (44, "유관기관"),
        ],
        "cards": (46, 263),
        "goals": [46, 81, 153, 200],  # 단계별 '가. 대응 지침' 쪽 (PDF)
        # 특보 → 대응단계 추천 근거: 프로세스 표 임무 제목의 특보 표기 (인쇄 p.34)
        "recommend": [
            {"level": "예비특보", "step": 0, "pdf": 40, "basis": "1단계 징후감지 — [1] 기상특보(태풍정보·호우예비특보·적설예보) 접수"},
            {"level": "주의보", "step": 1, "pdf": 40, "basis": "2단계 초기대응 — [4] 기상특보(태풍예비특보, 호우주의보, 적설량 예보) 접수"},
            {"level": "경보", "step": 2, "pdf": 40, "basis": "3단계 비상대응 — [7] 기상특보(태풍특보, 호우경보, 적설량 1cm~) 접수"},
            {"level": "해제", "step": 3, "pdf": 40, "basis": "4단계 수습·복구 — [9-11] 기상특보 해제 접수"},
        ],
    },
    {
        "id": "SOP-YEONGCHEON-FLOOD",
        "region": "yeongcheon",
        "manualId": "MAN-YEONGCHEON-2026",
        "title": "영천시 풍수해(태풍·호우, 대설) 재난 현장조치 행동매뉴얼",
        "short": "영천 풍수해 현장조치 행동매뉴얼",
        "file": "(영천)풍수해 현장조치 행동매뉴얼.pdf",
        "offset": 6,
        "style": "function",  # ①-1 / ①-1-1 (협업기능형, R10)
        "mine": "안전재난하천과",
        "table": [(33, ["초기대응부서", "지휘부", "지휘부"]), (34, "협업부서"), (35, "협업부서"), (36, "협업부서"), (37, "협업부서")],
        "cards": (38, 263),
        "goals": [38, 62, 93, 188],
        # 재난대응 단계 표 (인쇄 p.26): 상황 열의 특보 표기
        "recommend": [
            {"level": "예비특보", "step": 0, "pdf": 32, "basis": "평시 및 초기대응 — 태풍 정보 발표, 호우·대설 예비특보 발표 등"},
            {"level": "주의보", "step": 1, "pdf": 32, "basis": "지대본 비상 1단계 — 태풍 예비특보, 호우·대설 주의보 발표"},
            {"level": "경보", "step": 2, "pdf": 32, "basis": "지대본 비상 2·3단계 — 태풍특보, 호우·대설 경보 발표"},
            {"level": "해제", "step": 3, "pdf": 32, "basis": "수습·복구 — 기상특보 해제 후 (피해 발생 시) 수습·복구를 시행하는 단계"},
        ],
    },
    {
        "id": "SOP-INJE-FLOOD",
        "region": "inje",
        "manualId": "MAN-INJE-2026",
        "title": "인제군 풍수해 현장조치 행동매뉴얼",
        "short": "인제 풍수해 현장조치 행동매뉴얼",
        "file": "(인제) 풍수해 현장조치 행동매뉴얼(비상연락망 삭제본).pdf",
        "offset": 0,
        "style": "bracket",
        "mine": "안전교통과",
        "table": [(64, ["초기대응부서"]), (65, ["지휘부", "지휘부", "협업부서"]), (66, "협업부서"), (67, "협업부서"), (68, "협업부서"), (69, "협업부서"), (70, "협업부서")],
        "cards": (72, 206),
        "goals": [72, 84, 133, 196],
        # 과장·국장·지휘부 요약본 (p.8~9)
        "recommend": [
            {"level": "예비특보", "step": 0, "pdf": 8, "basis": "1단계 징후 감지 — 기상 전망 시, 예비 특보 시"},
            {"level": "주의보", "step": 1, "pdf": 8, "basis": "2단계 초기 대응 — 주의보 발효"},
            {"level": "경보", "step": 2, "pdf": 9, "basis": "3단계 비상 대응 — 주의보(확대), 경보 발효"},
            {"level": "해제", "step": 3, "pdf": 9, "basis": "4단계 수습·복구 — 상황 종료 시"},
        ],
    },
]

# ---------------------------------------------------------------- 공통 전처리 (R20)
MID_DOTS = "·․‧ㆍ･・"
CIRCLED = {chr(0x2460 + i): str(i + 1) for i in range(20)}


# 글꼴 기호(Wingdings)가 라틴 문자로 읽힌 것 — Ÿ = 글머리 •, è·ò = →, ž = 가운뎃점
GLYPH_FIX = {"Ÿ": "•", "è": "→", "ò": "→", "ž": "·"}


def norm(t: str) -> str:
    t = t.replace("\xa0", " ").replace("　", " ")
    for c in MID_DOTS:
        t = t.replace(c, "·")
    for a, b in GLYPH_FIX.items():
        t = t.replace(a, b)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def squash(t: str) -> str:
    """띄어쓰기 무시 비교용"""
    return re.sub(r"\s+", "", norm(t))


PHONE = re.compile(r"([☎☏]\s*)?\(?0\d{1,3}\)?[\s\-－~.—–‐‒―]*\d{3,4}[\s\-－~.—–‐‒―]*\d{4}(\s*~\s*\d+)?|[☎☏]\s*[\d\-~—–]+")


NL = "\n"
# 괄호째 적은 전화번호 '(033-242-9131)', '(☏3040)'
PHONE_PAREN = re.compile(r"\(\s*(?:[☎☏]\s*)?(?:0\d{1,3}\)?[\s\-－~.]*)?\d{3,4}[\s\-－~.]*\d{4}\s*\)|\(\s*[☎☏]\s*[\d\-~]+\s*\)")
# 직위·역할 뒤에 붙은 실명 (R17) — '반장: 김광재', '담당자(도승욱)', '담당자 (윤선호 )'
ROLE = r"(반장|반원|담당자|담당|팀장|과장|주무관|성명|책임자|관리자|연락관)"
PNAME = r"([가-힣]{2,4}(?:\s*[,·]\s*[가-힣]{2,4})*)"
NAME_PAREN = re.compile(ROLE + r"\s*\(\s*" + PNAME + r"\s*\)")
NAME_COLON = re.compile(ROLE + r"\s*[:：]\s*" + PNAME + r"(?![가-힣])")
# 사람 이름이 아닌 말 ('과장(필요 시 …)', '담당: 방재팀')
NOT_NAME_HEAD = ("필요", "부재", "직무", "대행", "공석", "당직", "해당", "전체", "협조", "지원", "요청", "포함", "총괄", "실무", "방재", "주관", "소관", "현장", "비상", "상황", "재난", "자연", "안전",
                 "한전", "한국", "경찰", "소방", "기상", "군청", "시청", "도청", "구청", "긴급", "선임", "주무", "임시", "정보", "조치", "전파", "보고", "주민", "이장", "통장",
                 "장비", "인력", "차량", "구조", "구호", "방역", "이재", "기획", "인사", "공보", "홍보")
NOT_NAME_TAIL = ("팀", "과", "실", "반", "부", "청", "소", "서", "단", "관", "국", "대", "센터", "본부", "담당")
# 전화 기호 앞뒤의 실명 — '윤선호 ☎ 010-…', '☎ 이지민 사회복지사' (기관·부서 이름은 남김)
NAME_BEFORE_TEL = re.compile(r"(?<![가-힣])([가-힣]{2,4})\s*(?=[☎☏])")
NAME_AFTER_TEL = re.compile(r"([☎☏])\s*([가-힣]{2,4})(?![가-힣])")
# '(담당자 윤선호)', '점검 * 윤선호' — 역할 뒤 띄어 쓴 이름, 줄 끝 * 뒤 이름 (세 글자 성명 꼴만)
SURNAME_CHARS = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용"
NAME_SPACE = re.compile(ROLE + r"\s+([" + SURNAME_CHARS + r"][가-힣]{2})(?=\s*\))")
NAME_STAR_END = re.compile(r"\s*[*＊]\s*([" + SURNAME_CHARS + r"][가-힣]{2})\s*$")


def is_person(s: str) -> bool:
    """성씨로 시작하고 기관·부서·일반 낱말이 아닌 2~4글자 (실명 후보)"""
    return s[:1] in SURNAME_CHARS and not s.startswith(NOT_NAME_HEAD) and not s.endswith(NOT_NAME_TAIL)


def _drop_name(m):
    parts = re.split(r"\s*[,·]\s*", m.group(2))
    return m.group(1) if all(is_person(p) for p in parts) else m.group(0)


def scrub(t: str) -> str:
    """R17 실명·전화번호는 보내지 않음 (줄바꿈은 유지)"""
    out = []
    for ln in (t or "").split(NL):
        ln = re.sub(r"\(?\s*:?\s*https?://\d[\d.]*\s?\d*[^\s)]*\s*\)?", "", ln)  # 내부망(IP) 주소
        ln = NAME_BEFORE_TEL.sub(lambda m: "" if is_person(m.group(1)) else m.group(0), ln)
        ln = NAME_AFTER_TEL.sub(lambda m: m.group(1) if is_person(m.group(2)) else m.group(0), ln)
        ln = PHONE_PAREN.sub("", ln)
        ln = PHONE.sub("", ln)
        ln = re.sub(r"[☎☏]\s*(?=$|[\s)])", "", ln)
        ln = re.sub(r"\(\s*(FAX|fax|Fax|팩스)?\s*\)", "", ln)
        ln = NAME_PAREN.sub(_drop_name, ln)
        ln = NAME_COLON.sub(_drop_name, ln)
        ln = NAME_SPACE.sub(lambda m: m.group(1) if is_person(m.group(2)) else m.group(0), ln)
        ln = NAME_STAR_END.sub(lambda m: "" if is_person(m.group(1)) else m.group(0), ln)
        ln = re.sub(r"\s+\)", ")", ln)
        ln = re.sub(r"\s+,", ",", ln)
        ln = re.sub(r"\(\s*\)", "", ln)
        ln = re.sub(r"[ \t]{2,}", " ", ln).strip(" ,")
        if ln:
            out.append(ln)
    return NL.join(out)


def fill_key(f):
    return tuple(round(v, 2) for v in f) if f else None


# ---------------------------------------------------------------- 표 칸 찾기
def page_lines(pg):
    out = []
    for bl in pg.get_text("dict")["blocks"]:
        for ln in bl.get("lines", []):
            txt = "".join(s["text"] for s in ln["spans"])
            if not txt.strip():
                continue
            x0, y0, x1, y1 = ln["bbox"]
            bold = any(s["flags"] & 16 or "Bold" in s["font"] or "bold" in s["font"].lower() for s in ln["spans"] if s["text"].strip())
            size = max((sp["size"] for sp in ln["spans"] if sp["text"].strip()), default=0)
            out.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "t": txt, "bold": bold, "size": size})
    return out


def table_cells(pg):
    cells, grays = [], []
    for d in pg.get_drawings():
        f = fill_key(d.get("fill"))
        r = d["rect"]
        if not f or r.width < 30 or r.height < 12:
            continue
        if f in STEP_FILL:
            cells.append({"col": STEP_FILL[f], "x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1})
        elif f == GRAY:
            grays.append({"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1})
    # 중복 제거
    seen, uniq = set(), []
    for c in cells:
        k = (c["col"], round(c["x0"]), round(c["y0"]), round(c["x1"]), round(c["y1"]))
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    return uniq, grays


def inside(ln, c, pad=3):
    cy = (ln["y0"] + ln["y1"]) / 2
    return ln["x0"] >= c["x0"] - pad and ln["x1"] <= c["x1"] + pad and c["y0"] - 1 <= cy <= c["y1"] + 1


def split_bands(cells, grays, head_y1):
    """부서 행 묶음 (R19) — 회색 구분 칸이 있으면 그 범위, 없으면 네 열 공통 경계·빈틈으로 나눔"""
    body = [c for c in cells if c["y0"] >= head_y1 - 1]
    bands = []
    for g in grays:
        if g["y0"] >= head_y1 - 1 and g["y1"] - g["y0"] > 20:
            bands.append([g["y0"], g["y1"]])
    # 회색 칸에 덮이지 않은 칸
    rest = [c for c in body if not any(b[0] - 2 <= (c["y0"] + c["y1"]) / 2 <= b[1] + 2 for b in bands)]
    if rest:
        ivs = sorted([(c["y0"], c["y1"]) for c in rest])
        merged = []
        for a, b in ivs:
            if merged and a <= merged[-1][1] + 2:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        # 네 열이 모두 같은 y 에서 끝나면 행 경계
        for m in merged:
            inner = [c for c in rest if c["y0"] >= m[0] - 1 and c["y1"] <= m[1] + 1]
            ends = {}
            for c in inner:
                ends.setdefault(round(c["y1"]), set()).add(c["col"])
            cuts = sorted(y for y, cols in ends.items() if len(cols) == 4 and m[0] + 5 < y < m[1] - 5)
            start = m[0]
            for y in cuts:
                bands.append([start, y])
                start = y
            bands.append([start, m[1]])
    bands.sort()
    # 가까운 회색 칸 경계 정리 (같은 행 두 칸)
    out = []
    for b in bands:
        if out and b[0] < out[-1][1] - 3:
            out[-1][1] = max(out[-1][1], b[1])
        else:
            out.append(b)
    return out


ORG_END = ("및", "적십자사", "과", "실", "소", "청", "서", "단", "관", "센터", "본부", "지사", "공사", "사단", "부대", "협회", "시", "군", "구", "도", "반", "팀", "대", "원", "처", "국", "등", ")", ",", "부서", "기관", "매체", "장")


def join_label(prev: str, nxt: str) -> str:
    """구분 칸 줄바꿈 이음 — 앞 줄이 기관·부서 이름으로 끝나면 띄우고, 낱말 중간에서 끊긴 것이면 붙임 (R5·R20)"""
    if not prev:
        return nxt
    if prev.endswith(ORG_END) or nxt.startswith(("(", "·", "등")) or prev.endswith("·"):
        sep = "" if nxt.startswith("·") or prev.endswith("·") else " "
        return prev + sep + nxt
    return prev + nxt


def label_text(lines, x_max, y0, y1):
    """왼쪽 구분 칸 글자 (세로쓰기 이음 R20) → 열(x)별 묶음"""
    sel = [ln for ln in lines if ln["x0"] < x_max - 2 and ln["x0"] + len(ln["t"].rstrip()) * 2 <= x_max + 12
           and ln["x1"] <= x_max + 14 and y0 - 1 <= (ln["y0"] + ln["y1"]) / 2 <= y1 + 1]
    sel.sort(key=lambda l: (round(l["x0"] / 8), l["y0"]))
    cols = []
    for ln in sorted(sel, key=lambda l: l["x0"]):
        for c in cols:
            if abs(c["x"] - ln["x0"]) < 14 or (ln["x0"] < c["x1"] - 4 and ln["x1"] > c["x"] + 4):
                c["ls"].append(ln)
                c["x1"] = max(c["x1"], ln["x1"])
                break
        else:
            cols.append({"x": ln["x0"], "x1": ln["x1"], "ls": [ln]})
    res = []
    for c in sorted(cols, key=lambda c: c["x"]):
        ls = sorted(c["ls"], key=lambda l: l["y0"])
        parts = [norm(l["t"]) for l in ls]
        one_char = sum(1 for p in parts if len(p.replace(" ", "")) <= 1)
        if one_char >= len(parts) * 0.6:
            # 세로쓰기: 글자 사이 간격이 크게 벌어진 곳이 낱말 경계
            gaps = [b["y0"] - a["y0"] for a, b in zip(ls, ls[1:])]
            med = sorted(gaps)[len(gaps) // 2] if gaps else 0
            words, cur = [], parts[0] if parts else ""
            for g, p in zip(gaps, parts[1:]):
                if med and g > med * 1.6:
                    words.append(cur)
                    cur = p
                else:
                    cur += p
            words.append(cur)
            parts = [w for w in words if w]
        txt = ""
        for p in parts:
            txt = join_label(txt, p)
        res.append(norm(txt))
    return [r for r in res if r and r not in ("구 분", "구분")]


# ---------------------------------------------------------------- 칸 안 글 → 임무·조치·세부행동
DETAIL_SYM = "-\xad－–"
BULLET_SYM = "■□▪▫●○◦◘◙⦁•·ㅇ❍◯∎▣◆◇◈▲△►▸▹✓√❏❑" + "".join(chr(c) for c in range(0xF000, 0xF100))
SUB_SYM = "⇨➡→▶▷⇒"
NOTE_SYM = "※＊*"
CODE_RE = re.compile(r"^\s*\[{1,2}\s*([0-9①-⑳][0-9①-⑳\s\-－,]*)\]")
NOCODE_RE = re.compile(r"^\s*\[([^\]\[0-9①-⑳][^\]]*)\]\s*(.*)$")
TYPO_MISSING_OPEN = re.compile(r"^\s*(\d{1,2})\](.*)$")  # '3]재대본 …' (R21)
NEED_RE = re.compile(r"^\(?\s*(필요\s*시|필요시)\s*\)?$")
LEAD_COND = re.compile(r"^\(\s*((?:필요|피해\s*발생|피해발생|운영|가동|설치|통지본|재대본|대피|발생)[^()]*?시?)\s*\)\s*(.+)$")
TAIL_COND = re.compile(r"^(.+?)\s*\(\s*([^()]*?(?:시|필요\s*시))\s*\)\s*$")
STAR_COND = re.compile(r"^(.+?)\s*[＊*]\s*([^＊*]+시)\s*$")


def code_norm(raw: str) -> str:
    s = raw
    for k, v in CIRCLED.items():
        s = s.replace(k, v)
    s = s.replace("－", "-").replace(" ", "")
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-,")


def split_codes(line: str):
    """[3-3][3-4] 제목 → (['3-3','3-4'], 제목) · [①-2-3] → ('1-2-3')"""
    codes, raw = [], []
    rest = line
    while True:
        m = CODE_RE.match(rest)
        if not m:
            break
        raw.append(m.group(1))
        codes.append(code_norm(m.group(1)))
        rest = rest[m.end():]
    return codes, raw, norm(rest)


def take_condition(title: str):
    """R8 조치 전체에 붙은 조건 → condition, R18 제목 일부의 조건은 그대로"""
    t = title
    m = re.match(r"^\(\s*(필요\s*시|필요시|피해\s*발생\s*시|피해발생시)\s*\)\s*(.+)$", t)
    if m:
        return norm(m.group(2)), norm(m.group(1))
    m = STAR_COND.match(t)
    if m and is_condition(m.group(2)):
        return norm(m.group(1)), norm(m.group(2))
    m = TAIL_COND.match(t)
    if m and len(m.group(2)) <= 18 and not re.search(r"\d+시", m.group(2)) and is_condition(m.group(2)):
        return norm(m.group(1)), norm(m.group(2))
    return t, ""


COND_WORDS = ("필요", "피해", "발생", "우려", "운영", "가동", "설치", "비상", "요청", "해당", "확대", "북상")
STAGE_WORDS = ("특보", "평시", "주의보", "경보", "단계")


def is_condition(c: str) -> bool:
    """R8 조치 전체에 붙은 조건인지 — '(평시 또는 예비특보 시)' 같은 단계 표기는 조건이 아님"""
    return any(w in c for w in COND_WORDS) and not any(w in c for w in STAGE_WORDS)


def strip_changed(title: str):
    """영천 (변경) 표기: 이전 단계와 내용이 다름"""
    if re.search(r"\(\s*변경\s*\)\s*$", title):
        return norm(re.sub(r"\(\s*변경\s*\)\s*$", "", title)), True
    return title, False


def split_inline_note(title: str):
    if "※" in title:
        a, b = title.split("※", 1)
        return norm(a), norm(b)
    return title, ""


def lead_sym(t: str):
    s = t.lstrip()
    if not s:
        return "", ""
    c = s[0]
    if c in DETAIL_SYM:
        return "detail", s[1:].strip()
    if c in SUB_SYM:
        return "sub", s[1:].strip()
    if c in NOTE_SYM:
        return "note", s[1:].strip()
    if c in BULLET_SYM:
        return "bullet:" + c, s[1:].strip()
    return "", s


def merge_rows(cell_lines):
    """같은 줄(y)에 끊긴 조각을 이어 붙임"""
    rows = []
    for ln in sorted(cell_lines, key=lambda l: (round(l["y0"], 0), l["x0"])):
        if rows and abs(rows[-1]["y0"] - ln["y0"]) < 2.2 and ln["x0"] >= rows[-1]["x1"] - 2:
            gap = ln["x0"] - rows[-1]["x1"]
            rows[-1]["t"] += (" " if gap > 2 else "") + ln["t"]
            rows[-1]["x1"] = ln["x1"]
            rows[-1]["bold"] = rows[-1]["bold"] or ln["bold"]
            rows[-1]["size"] = max(rows[-1].get("size", 0), ln.get("size", 0))
        else:
            rows.append(dict(ln))
    return rows


class CellParser:
    """한 칸(부서 행 × 단계 열)의 글 → missions/actions"""

    def __init__(self, man, step_i, group, sub, page_pdf, warn):
        self.man, self.step_i, self.group, self.sub, self.page = man, step_i, group, sub, page_pdf
        self.mdepth = 2 if man["style"] == "function" else 1
        self.missions, self.actions = [], []
        self.mission = None
        self.action = None
        self.last = None  # 이어 붙일 대상 (dict, key)
        self.cond_block = ""
        self.first_bullet = None  # 번호 없는 칸에서 조치가 되는 첫 깊이 기호
        self.warn = warn
        self.seq = 0
        self.prev_end = None  # 앞 줄 오른쪽 끝 (줄바꿈 판단 R5)

    # -- 생성
    def new_mission(self, code, name, implicit=False):
        name, cond = take_condition(name)
        m = {"code": code, "name": name, "condition": cond, "implicit": implicit}
        self.missions.append(m)
        self.mission, self.action, self.last = m, None, (m, "name")
        self.cond_block = ""
        self.first_bullet = None
        return m

    def mission_as_action(self, m):
        """[n] 제목 아래 [n-m] 없이 세부행동만 있는 임무 → 조치 1건 (코드 n)"""
        self.seq += 1
        a = {"code": m["code"], "raw": f"[{m['code']}]", "name": m["name"], "mission": m, "condition": m.get("condition", ""),
             "notes": list(m.get("notes", [])), "details": [], "coded": True, "changed": False, "order": self.seq, "selfMission": True}
        m["notes"] = []
        self.actions.append(a)
        self.action, self.last = a, (a, "name")
        return a

    def finish(self):
        """하위 조치가 하나도 없는 번호 임무 → 임무 자체를 조치로 (그 임무의 조치들 앞에 둠)"""
        for m in self.missions:
            if m["code"] and not any(x["mission"] is m and x["coded"] for x in self.actions):
                a = self.mission_as_action(m)
                self.actions.remove(a)
                first = next((i for i, x in enumerate(self.actions) if x["mission"] is m), len(self.actions))
                self.actions.insert(first, a)

    def ensure_mission(self):
        if not self.mission:
            gname = self.group["name"]
            self.new_mission(None, f"{gname} 조치", implicit=True)
        return self.mission

    def new_action(self, code, raw, title, coded=True):
        self.ensure_mission()
        title, note = split_inline_note(title)
        title, changed = strip_changed(title)
        title, cond = take_condition(title)
        cond = cond or self.cond_block or self.mission.get("condition", "")
        self.seq += 1
        a = {
            "code": code, "raw": raw, "name": title, "mission": self.mission, "condition": cond,
            "notes": [note] if note else [], "details": [], "coded": coded, "changed": changed, "order": self.seq,
        }
        self.actions.append(a)
        self.action, self.last = a, (a, "name")
        return a

    # -- 한 줄 처리
    def feed(self, t, row=None, cell=None):
        # 한글 줄바꿈은 낱말 단위라 앞 줄이 칸 끝에서 한 낱말(약 55pt) 안쪽까지 찼으면 줄바꿈으로 봄
        wrapped = self.prev_end is not None and cell is not None and self.prev_end >= cell["x1"] - 55
        self.prev_end = row["x1"] if row else None
        t = norm(t)
        if not t or not scrub(lead_sym(t)[1] or t):  # 주소만 있는 줄 등
            return
        self._feed(t, wrapped)

    def _feed(self, t, wrapped):
        # R21 '3]제목' → '[3]제목'
        m = TYPO_MISSING_OPEN.match(t)
        if m and not t.startswith("["):
            t = f"[{m.group(1)}]{m.group(2)}"
        codes, raw, rest = split_codes(t)
        if codes:
            depth = len(codes[0].split("-"))
            if len(codes) == 1 and depth <= self.mdepth:
                self.new_mission(codes[0], rest)
                return
            mcode = "-".join(codes[0].split("-")[: self.mdepth])
            if not self.mission or self.mission["code"] != mcode:
                same = next((m for m in self.missions if m["code"] == mcode), None)
                if same:  # 같은 칸에서 앞서 나온 임무로 돌아감 (코드 순서가 섞인 표)
                    self.mission, self.action, self.cond_block, self.first_bullet = same, None, "", None
                elif not (self.mission and self.mission["code"] is None and not self.mission["implicit"]):
                    # R7 상위 [n] 없이 [n-m]만 → 임무 n (이름은 행동카드 조치목록으로 채움)
                    self.new_mission(mcode, "", implicit=True)
            self.new_action(",".join(codes), "".join(f"[{r}]" for r in raw), rest)
            return
        m = NOCODE_RE.match(t)
        if m:
            inner, rest = norm(m.group(1)), norm(m.group(2))
            if NEED_RE.match(inner):  # R23
                self.cond_block = "필요시"
                self.action = None
                self.first_bullet = None
                if rest:
                    self.new_action(None, "", rest, coded=False)
                return
            self.new_mission(None, inner)  # R21 번호 없는 대괄호 소제목 = 임무
            if rest:
                self.new_action(None, "", rest, coded=False)
            return
        kind, body = lead_sym(t)
        if kind == "note":
            target = self.action or self.mission
            if target is None:
                self.warn.append({"page": self.page - self.man["offset"], "reason": f"칸 머리 설명: {scrub(body)[:40]}"})
                return
            target.setdefault("notes", []).append(scrub(body))
            self.last = (target["notes"], len(target["notes"]) - 1)
            return
        a = self.action
        if kind == "detail" and not a and self.mission and self.mission["code"] and not any(x["mission"] is self.mission for x in self.actions):
            a = self.mission_as_action(self.mission)
        if kind == "detail" or kind == "sub" or kind.startswith("bullet:"):
            sym = kind.split(":", 1)[1] if kind.startswith("bullet:") else kind
            if a and a["coded"]:
                # 번호 붙은 조치 아래: 첫 깊이 = 세부행동 제목, 그 아래 = 내용 (R3·R13)
                if kind == "detail" or not a["details"]:
                    a["details"].append({"title": scrub(body), "content": ""})
                    self.last = (a["details"][-1], "title")
                else:
                    d = a["details"][-1]
                    d["content"] = (d["content"] + "\n" if d["content"] else "") + scrub(body)
                    self.last = (d, "content")
                return
            # 번호 없는 칸(단계 × 주체 매트릭스): 첫 깊이 기호 줄 = 조치, 그 아래 = 세부행동
            if self.first_bullet is None or not a:
                self.first_bullet = self.first_bullet or sym
            if sym == self.first_bullet or not a:
                self.new_action(None, "", body, coded=False)
                return
            a["details"].append({"title": scrub(body), "content": ""})
            self.last = (a["details"][-1], "title")
            return
        # 기호 없는 줄
        if self.last and self.last[0] is self.mission and not self.mission.get("code") and not self.action and self.mission["name"]:
            # [소제목] 아래 문장 = 조치 (번호 없는 매뉴얼)
            self.new_action(None, "", body, coded=False)
            self.first_bullet = "plain"
            return
        title_line = bool(self.last) and self.last[1] == "name" and (self.last[0] is self.action or self.last[0] is self.mission)
        plain_item = bool(self.last) and self.last[1] == "title" and isinstance(self.last[0], dict) and self.last[0].get("_plain")
        if not wrapped and (title_line or plain_item) and not body.startswith("(") and (self.action or (self.mission and self.mission["code"])):
            # 제목 줄(또는 기호 없이 적은 항목)이 칸 끝까지 차지 않았는데 기호 없이 이어지는 줄
            # = 줄바꿈이 아니라 따로 적은 항목 → 세부행동. ('-' 세부행동·※ 설명 줄은 손으로 줄을 바꾼 경우가 많아 R5대로 이어 붙임)
            a = self.action or self.mission_as_action(self.mission)
            a["details"].append({"title": scrub(body), "content": "", "_plain": True})
            self.last = (a["details"][-1], "title")
            return
        if self.last:  # R5 칸이 좁아 줄바꿈된 것 — 앞 줄에 이어 붙임
            obj, key = self.last
            prev = obj[key]
            joiner = "" if (prev.endswith(("(", "·", "/", "-")) or body.startswith((")", "·", ","))) else " "
            obj[key] = norm(prev + joiner + body)
            if obj is self.action and key == "name":
                # 이어 붙인 뒤 조건·변경 다시 판단
                n, ch = strip_changed(obj["name"])
                n, cond = take_condition(n)
                obj["name"], obj["changed"] = n, obj["changed"] or ch
                if cond and not obj["condition"]:
                    obj["condition"] = cond
            return
        self.new_action(None, "", body, coded=False)


# ---------------------------------------------------------------- 행동카드 (②)
CARD_LABELS = ["코드번호", "조치목록", "조치내용", "주관부서", "지원부서", "협업기관", "연계코드"]


def step_of_label(s: str):
    s = squash(s)
    if not s:
        return None
    if "평시" in s or "징후" in s:
        return 0
    if "비상1" in s:
        return 1
    if "비상2" in s or "2·3" in s or "23단계" in s:
        return 2
    if "초기" in s:
        return 1
    if "비상" in s:
        return 2
    if "수습" in s or "복구" in s:
        return 3
    return None


# 행동카드 본문 (② 표준행동 · ③ 전파 표·표준문안 · ④ 지시내용)
CONTACT_HEAD = re.compile(r"연락처|휴대폰|휴대전화|핸드폰|행정전화|전화번호|사무실|성명|담당자|대행|FAX|팩스|이메일|메일")
ORG_HEAD = re.compile(r"기관|부서|소속")  # '기관명/부서명(담당자)'처럼 기관 이름 열은 남김
PLACE_HEAD = re.compile(r"기관|부서|소속|시설|장소|지역|명칭|읍|면|마을|하천|도로|지구|구분")
PERSON_CELL = re.compile(r"^[" + SURNAME_CHARS + r"][가-힣]{2}$")
STEP_MARK = r"(?:징후\s*감지|초기\s*대응|비상\s*대응|수습\s*·?\s*복구)"
PAGE_MARK = re.compile(r"^(?:[-–]\s*\d{1,3}\s*[-–]|\d{1,3}|태풍\s*·\s*호우\s*·\s*대설(?:\s*\d{1,3})?|[1-4]\s*단계(?:\s+\S+){0,2}|" + STEP_MARK + r"(?:\s*[1-4]\s*단계)?)$")
ATTACH = re.compile(r"^\[?\s*붙\s*임\s*(?:공통\s*)?[\d①-⑳\]]")  # 카드 뒤 붙임 서식(보고서·공문 예시)은 카드 본문이 아님
B1 = "○◯❍ㅇ●◦∘¡•⦁"
B2 = "-\xad－–‐▸▹►▪▫"
ARROWS = "⇨➡→▶▷⇒"
PLACEHOLDER = re.compile(r"^[○◯]\s*(?:[○◯]|월|일|시|분)")  # '○월 ○일 ○시' 같은 빈칸 표시는 글머리가 아님
HEAD_LABEL = re.compile(r"^[ⓢⓒ]?\s*(코\s*드\s*번\s*호|조\s*치\s*목\s*록|조\s*치\s*내\s*용|주\s*관\s*부\s*서|지\s*원\s*부\s*서|협\s*업\s*기\s*관|연\s*계\s*코\s*드)\s*[:：]?\s*(.*)$")


class PageTables:
    """쪽마다 표 감지 결과 (pymupdf find_tables) — 카드 머리 상자·본문 표를 함께 씀"""

    def __init__(self, doc):
        self.doc, self.cache = doc, {}

    def get(self, pno):
        if pno not in self.cache:
            try:
                found = self.doc[pno - 1].find_tables().tables
            except Exception:
                found = []
            self.cache[pno] = [ti for ti in (tab_info(t) for t in found) if ti]
        return self.cache[pno]


def dedup_edges(vals, tol=2.0):
    out = []
    for v in sorted(vals):
        if not out or v - out[-1] > tol:
            out.append(v)
    return out


# 한글은 글자 단위로 줄을 바꿔 낱말 중간에서 끊기기도 함 — 어미·조사로 시작하는 이음 줄은 붙여 씀 ('발효|됨에', '주의|하시기')
WORD_TAIL = ("됨", "됩니", "하시", "합니", "했", "하여", "하고", "하는", "해야", "해서", "한다", "도록", "에게", "에서", "으로", "니다", "습니")


def join_wrapped(prev: str, nxt: str) -> str:
    """칸·줄 너비 때문에 끊긴 줄 잇기 (R5). 글머리로 시작하는 줄은 새 줄로 둠"""
    if not prev:
        return nxt
    if nxt[:1] in B1 + B2 + NOTE_SYM + ARROWS or re.match(r"^\d{1,2}[.)]\s", nxt):
        return prev + NL + nxt
    if prev.endswith(("·", "(", "/", "→", "~", "-")) or nxt.startswith((")", "·", ",", "/", "→")):
        return prev + nxt
    if re.search(r"[가-힣]$", prev) and nxt.startswith(WORD_TAIL):
        return prev + nxt
    return prev + " " + nxt


def spaced_fix(t: str) -> str:
    """'구 분'·'표 준 문 안'처럼 글자 사이를 띄운 머리글 → 붙임"""
    return NL.join(re.sub(r"\s", "", ln) if re.fullmatch(r"[가-힣](?:\s[가-힣])+", ln) else ln for ln in t.split(NL))


def cell_text(raw) -> str:
    out = ""
    for p in (raw or "").split("\n"):
        p = norm(p)
        if p and (p[0] == "¡" or 0xF000 <= ord(p[0]) <= 0xF0FF):
            p = "○" + p[1:]  # 글꼴 기호로 그린 ○
        if p:
            out = join_wrapped(out, p)
    out = scrub(out)
    if NL not in out and out[:1] in B1 and out[1:2] == " ":
        out = out[2:]  # 한 줄 칸 앞의 글머리는 장식
    return spaced_fix(out)


def tab_info(t):
    """감지된 표 → 칸 목록 (합친 칸은 행·열 범위로)"""
    rows = t.rows
    if not rows:
        return None
    texts = t.extract()
    bbs = [(i, j, bb) for i, r in enumerate(rows) for j, bb in enumerate(r.cells) if bb]
    if not bbs:
        return None
    xs = dedup_edges([bb[0] for _, _, bb in bbs] + [bb[2] for _, _, bb in bbs])
    ys = dedup_edges([bb[1] for _, _, bb in bbs] + [bb[3] for _, _, bb in bbs])

    def idx(edges, v):
        return min(range(len(edges)), key=lambda k: abs(edges[k] - v))

    cells = []
    for i, j, bb in bbs:
        c0, c1, r0, r1 = idx(xs, bb[0]), idx(xs, bb[2]), idx(ys, bb[1]), idx(ys, bb[3])
        if c1 <= c0 or r1 <= r0:
            continue
        raw = texts[i][j] if i < len(texts) and j < len(texts[i]) else ""
        cells.append({"raw": raw or "", "t": cell_text(raw), "r0": r0, "r1": r1, "c0": c0, "c1": c1})
    if not cells:
        return None
    return {"bbox": tuple(t.bbox), "cells": cells, "nrow": len(ys) - 1, "ncol": len(xs) - 1, "flat": squash(" ".join(c["raw"] for c in cells))}


def header_fields(ti):
    """카드 머리 상자(표) → 라벨별 값. '라벨 : 값' 한 칸, 또는 라벨 칸 오른쪽 칸이 값"""
    rows = {}
    for c in ti["cells"]:
        rows.setdefault(c["r0"], []).append(c)
    f = {}
    for r in sorted(rows):
        cs = sorted(rows[r], key=lambda c: c["c0"])
        i = 0
        while i < len(cs):
            cur = None
            for ln in (norm(x) for x in cs[i]["raw"].split("\n")):
                if not ln:
                    continue
                m = HEAD_LABEL.match(ln)
                if m:
                    cur = squash(m.group(1))
                    val = m.group(2).strip(" :：")
                    if not val and i + 1 < len(cs) and not HEAD_LABEL.match(norm(cs[i + 1]["raw"].split("\n")[0])):
                        nraw = cs[i + 1]["raw"]
                        val = " · ".join(norm(x) for x in nraw.split("\n") if norm(x)) if cur == "연계코드" else cell_text(nraw)
                        i += 1
                        f[cur] = val
                        cur = None
                        continue
                    f[cur] = val
                elif cur:
                    f[cur] = (f[cur] + " · " + ln) if cur == "연계코드" and f[cur] else join_wrapped(f[cur], ln)
            i += 1
    return {k: scrub(v) for k, v in f.items()}


def scan_cards(doc, man, tables):
    a, b = man["cards"]
    cards = []
    for pno in range(a, b + 1):
        pg = doc[pno - 1]
        lines = page_lines(pg)
        heads = sorted([ln for ln in lines if squash(ln["t"]).startswith("코드번호")], key=lambda l: l["y0"])
        if not heads:
            continue
        tabs = tables.get(pno)
        for h in heads:
            # 카드 머리 영역: 코드번호 줄 위 40pt ~ 아래 90pt, 같은 표 폭
            y0, y1 = h["y0"] - 40, h["y0"] + 95
            area = [ln for ln in lines if y0 <= ln["y0"] <= y1]
            area_rows = merge_rows(area)
            text = " | ".join(norm(r["t"]) for r in sorted(area_rows, key=lambda r: (r["y0"], r["x0"])))
            fields = {}
            # 같은 줄(y)에서 라벨 오른쪽 값
            for lab in CARD_LABELS:
                for r in area:
                    sq = squash(r["t"])
                    k = sq.find(lab)
                    if k < 0:
                        continue
                    after = re.sub(r"^\s*[ⓢⓒ]?\s*" + r"\s*".join(lab) + r"\s*[:：]?\s*", "", norm(r["t"]))
                    if after and after != norm(r["t"]):
                        val = after
                    else:
                        val = ""
                    if not val:
                        cand = [o for o in area if abs((o["y0"] + o["y1"]) / 2 - (r["y0"] + r["y1"]) / 2) < 4 and o["x0"] > r["x1"] - 1]
                        cand.sort(key=lambda o: o["x0"])
                        stop = []
                        for o in cand:
                            if any(squash(o["t"]).startswith(l2) or squash(o["t"]).startswith("ⓢ" + l2) or squash(o["t"]).startswith("ⓒ" + l2) for l2 in CARD_LABELS):
                                break
                            stop.append(norm(o["t"]))
                        val = " ".join(stop)
                    fields[lab] = norm(val.lstrip(":： "))
                    break
            # 머리 상자가 표로 잡히면 그 칸 값이 더 정확함 (여러 줄 값·줄이 어긋난 값)
            cy = (h["y0"] + h["y1"]) / 2
            ht = next((t for t in tabs if "코드번호" in t["flat"] and t["bbox"][1] - 2 <= cy <= t["bbox"][3] + 2
                       and not any(w in t["flat"] for w in ("표준행동", "전파방법", "세부내용", "지시내용"))), None)
            if ht:
                for lab, v in header_fields(ht).items():
                    if v and lab != "코드번호":
                        fields[lab] = v
                hy0, hy1 = ht["bbox"][1], ht["bbox"][3]
            else:
                labs = [ln for ln in lines if h["y0"] - 5 <= ln["y0"] <= h["y0"] + 130 and re.match(r"^[ⓢⓒ]?(주관|지원|협업|연계|조치)", squash(ln["t"]))]
                hy0, hy1 = h["y0"] - 40, max([ln["y1"] for ln in labs] + [h["y1"]]) + 4
            # 카드 단계 표시: 머리 왼쪽 위 작은 글
            tags = [ln for ln in lines if h["y0"] - 45 <= ln["y0"] < h["y0"] - 2 and ln["x0"] < h["x0"] + 60]
            tag = " ".join(norm(t["t"]) for t in sorted(tags, key=lambda l: (l["y0"], l["x0"])))
            code_raw = fields.get("코드번호", "")
            code = code_norm(re.sub(r"[^0-9①-⑳\-－,]", "", code_raw.replace("~", ",")))
            cards.append({
                "pdf": pno, "y": h["y0"], "hy0": hy0, "hy1": hy1, "code": code, "codeRaw": code_raw, "tag": tag, "step": step_of_label(tag),
                "name": fields.get("조치목록", ""), "summary": fields.get("조치내용", ""),
                "lead": fields.get("주관부서", ""), "support": fields.get("지원부서", ""), "collab": fields.get("협업기관", ""),
                "link": fields.get("연계코드", ""), "head": text,
            })
    # 단계 표시가 없는 카드는 앞 카드 단계를 이어받음
    prev = None
    for c in cards:
        if c["step"] is None:
            c["step"] = prev
        prev = c["step"]
    return cards


def table_block(ti):
    """본문 표 → 화면용 행(합친 칸 유지) + 역할별 구조 (② 표준행동 · ③ 전파 표·표준문안).
    연락처·성명·담당자 열과 내용 없는 열은 뺀다 (R17, 비상연락망 삭제본의 빈 칸)."""
    cells, nrow, ncol = [dict(c) for c in ti["cells"]], ti["nrow"], ti["ncol"]

    def owners(cs):
        own = {}
        for c in cs:
            for rr in range(c["r0"], c["r1"]):
                for kk in range(c["c0"], c["c1"]):
                    own[(rr, kk)] = c
        return own

    own = owners(cells)
    first = [c for c in cells if c["r0"] == 0]
    hrows = 0
    if nrow >= 2 and any(c["t"] for c in first) and all(len(squash(c["t"])) <= 16 for c in first):
        hrows = max(c["r1"] - c["r0"] for c in first)
        if hrows >= nrow or hrows > 2:
            hrows = 1

    def head(k, o):
        seen, out = set(), []
        for rr in range(hrows):
            c = o.get((rr, k))
            if c is not None and id(c) not in seen:
                seen.add(id(c))
                out.append(c["t"])
        return squash(" ".join(out))

    drop = set()
    for k in range(ncol):
        h = head(k, own)
        body = [own.get((rr, k)) for rr in range(hrows, nrow)]
        if (h and CONTACT_HEAD.search(h) and not ORG_HEAD.search(h)) or (body and all(c is None or not c["t"] for c in body)):
            drop.add(k)
            continue
        # 머리글이 사람 열인지 분명하지 않아도 칸 대부분이 사람 이름 꼴이면 뺌 (R17) — 시설·지역 이름 열은 제외
        vals = list({id(c): c["t"] for c in body if c is not None and c["t"]}.values())
        named = [v for v in vals if PERSON_CELL.match(v) and is_person(v)]
        if len(named) >= 2 and len(named) >= 0.6 * len(vals) and not PLACE_HEAD.search(h):
            drop.add(k)
    keep = [k for k in range(ncol) if k not in drop]
    if not keep:
        return None
    pos = {k: i for i, k in enumerate(keep)}
    out = []
    for c in cells:
        ks = [k for k in range(c["c0"], c["c1"]) if k in pos]
        if ks:
            c.update({"c0": pos[ks[0]], "c1": pos[ks[-1]] + 1})
            out.append(c)
    # 그 행에서 시작하는 칸이 모두 빈 행은 지움 (위에서 내려온 합친 칸은 한 행 줄임). 연락처 열을 빼고 비는 머리 행도
    for rr in range(nrow - 1, -1, -1):
        if any(c["t"] for c in out if c["r0"] == rr):
            continue
        if rr < hrows:
            hrows -= 1
        rest = []
        for c in out:
            if c["r0"] == rr:
                if c["r1"] - c["r0"] > 1:
                    c["r1"] -= 1
                    rest.append(c)
                continue
            if c["r0"] < rr < c["r1"]:
                c["r1"] -= 1
            elif c["r0"] > rr:
                c["r0"] -= 1
                c["r1"] -= 1
            rest.append(c)
        out = rest
        nrow -= 1
    if nrow <= hrows:
        return None  # 머리만 남은 표 (연락처만 있던 표)
    own2 = owners(out)
    heads = [head(k, own2) for k in range(len(keep))]
    hflat = " ".join(heads)
    if "표준행동" in hflat:
        role = "std"
    elif any(w in hflat for w in ("전파방법", "전파대상", "전파수단")):
        role = "prop"
    elif "문안" in hflat:
        role = "tpl"
    else:
        role = "etc"

    def col(*keys):
        return next((k for k, h in enumerate(heads) if any(x in h for x in keys)), None)

    def val(rr, k):
        c = own2.get((rr, k)) if k is not None else None
        return c["t"] if c else ""

    std, prop, tpl = [], [], []
    if role == "std":
        ks, kd, kn = col("표준행동"), col("세부내용", "지시내용", "세부"), col("비고")
        last_t = None
        for rr in range(hrows, nrow):
            tc = own2.get((rr, ks)) if ks is not None else None
            dc = own2.get((rr, kd)) if kd is not None else None
            content, note = (dc["t"] if dc else ""), val(rr, kn)
            if std and ((tc is not None and tc is last_t) or not (tc and tc["t"])):
                d = std[-1]  # 표준행동 칸이 여러 행에 걸침 → 세부내용 이어 붙임
                if content and dc is not own2.get((rr - 1, kd)):
                    d["content"] = (d["content"] + NL if d["content"] else "") + content
                if note and note not in d["note"]:
                    d["note"] = (d["note"] + " " + note).strip()
                continue
            if tc and tc["t"]:
                std.append({"title": tc["t"].replace(NL, " "), "content": content, "note": note})
                last_t = tc
    elif role == "prop":
        kk, km, kt, kn = col("구분"), col("방법", "수단"), col("대상"), col("비고")
        for rr in range(hrows, nrow):
            row = {"kind": val(rr, kk), "method": val(rr, km), "target": val(rr, kt), "note": val(rr, kn)}
            row = {a: b for a, b in row.items() if b}
            if row.get("method") or row.get("target"):
                prop.append(row)
    elif role == "tpl":
        kk, kx = col("구분", "상황", "매체", "대상"), col("문안")
        seen = {}
        for rr in range(hrows, nrow):
            xc = own2.get((rr, kx)) if kx is not None else None
            if not xc or not xc["t"]:
                continue
            kind = val(rr, kk) if kk != kx else ""
            if id(xc) in seen:
                it = seen[id(xc)]
                if kind and kind not in it["kind"]:
                    it["kind"] = (it["kind"] + " · " + kind).strip(" ·")
                continue
            it = {"kind": kind, "text": xc["t"]}
            seen[id(xc)] = it
            tpl.append(it)
    rows = []
    for rr in range(nrow):
        rc = []
        for c in sorted([c for c in out if c["r0"] == rr], key=lambda c: c["c0"]):
            cell = {"t": c["t"]}
            if c["r1"] - c["r0"] > 1:
                cell["rs"] = c["r1"] - c["r0"]
            if c["c1"] - c["c0"] > 1:
                cell["cs"] = c["c1"] - c["c0"]
            if rr < hrows:
                cell["h"] = True
            rc.append(cell)
        rows.append(rc)
    block = {"k": "table", "role": role, "cols": len(keep), "rows": rows}
    if tpl:
        block["items"] = [{k: v for k, v in it.items() if v} for it in tpl]
    return {"block": block, "std": std, "prop": prop, "tpl": tpl}


CONTACT_WORDS = {"성명", "연락처", "주소", "소속", "직급", "직위", "휴대폰", "휴대전화", "전화", "전화번호", "사무실", "자택", "이름", "담당자", "취약계층", "관계", "비고", "구분"}


def contact_header(t: str) -> bool:
    """표로 잡히지 않은 비상연락망 머리글 줄 ('성명 연락처 주소 소속 …') — 내용을 지운 빈 연락망 (R17)"""
    toks = [x for x in (re.sub(r"\(.*?\)", "", w) for w in t.split()) if x]
    return len(toks) >= 3 and sum(1 for x in toks if x in CONTACT_WORDS or x.endswith("담당자")) / len(toks) >= 0.75


def split_note(t: str):
    """'징후 평가회의 개최 * 부재 시 차하급자 주관' → 제목, 덧붙인 설명"""
    m = re.match(r"^(.*?\S)\s*(?:※|\s[*＊])\s*(\S.*)$", t)
    return (norm(m.group(1)), norm(m.group(2))) if m else (t, "")


def bullet_kind(t: str):
    c = t[:1]
    if not c:
        return None
    if c in B1 or 0xF000 <= ord(c) <= 0xF0FF:
        return None if PLACEHOLDER.match(t) else 1
    if c in B2:
        return 2
    if c == "·":
        return 3
    return None


def text_block(t, r, prev, pno, right):
    """카드 본문 한 줄 → 블록. 앞 줄에 이어지는 줄(R5)이면 앞 블록에 붙이고 None"""
    m = re.match(r"^(\d{1,2})\s*\.\s*(\S.*)$", t)
    if m and not re.match(r"^\d{1,2}\s*\.\s*\d", t):
        title, note = split_note(m.group(2))
        b = {"k": "h", "n": m.group(1), "t": scrub(title)}
        if note:
            b["note"] = scrub(note)
        return b
    lv = bullet_kind(t)
    if lv:
        return {"k": "p", "lv": lv, "t": scrub(t[1:].strip())}
    c = t[0]
    if c in ARROWS:
        return {"k": "p", "lv": 2, "t": scrub(t[1:].strip()), "sym": c}
    if c == "※":
        return {"k": "note", "t": scrub(t[1:].strip())}
    if c in "*＊":
        return {"k": "note", "t": scrub(t[1:].strip()), "sym": "*"}
    if prev:
        pb, pr = prev
        lh = max(pr["y1"] - pr["y0"], 8)
        near = pr["pno"] == pno and -3 <= r["y0"] - pr["y1"] < lh * 1.2
        hang = r["x0"] > pr["x0"] + 2  # 글머리 뒤로 들여 쓴 이음 줄
        full = abs(r["x0"] - pr["x0"]) <= 3 and pr["x1"] >= right - 30  # 앞 줄이 오른쪽 끝까지 참 (내어쓰기 없는 줄바꿈)
        if near and (hang or full):
            key = "note" if pb.get("note") else "t"
            pb[key] = scrub(join_wrapped(pb[key], t))  # 줄이 나뉜 '담당자 (실명)'도 이은 뒤 다시 거름
            pr["y1"], pr["x1"] = r["y1"], r["x1"]
            return None
    return {"k": "p", "lv": 0, "t": scrub(t)}


def card_content(doc, tables, card, nxt, man):
    """행동카드 본문 — 머리 상자 아래부터 다음 카드 머리 전까지, 원문 순서대로 블록 (번호 제목·글머리·표·※)"""
    start = card["pdf"]
    last_p = min(nxt["pdf"], start + 3) if nxt else start + 1
    blocks, pages, std, prop, tpl = [], [], [], [], []
    prev = None
    for pno in range(start, last_p + 1):
        if pno != start and (pno in man["goals"] or pno > man["cards"][1]):
            break  # 다음 단계 머리(대응 지침) 쪽은 카드가 아님
        pg = doc[pno - 1]
        H = pg.rect.height
        top = card["hy1"] + 1 if pno == start else 0
        bot = nxt["hy0"] - 1 if nxt and pno == nxt["pdf"] else H
        if bot - top < 8:
            continue
        tabs = [t for t in tables.get(pno) if top - 3 <= t["bbox"][1] and t["bbox"][3] <= bot + 3 and "코드번호" not in t["flat"]]
        all_rows = merge_rows([l for l in page_lines(pg) if top <= (l["y0"] + l["y1"]) / 2 <= bot])
        right = max([r["x1"] for r in all_rows] + [0])
        items = [(t["bbox"][1], 0, t) for t in tabs]
        for r in all_rows:
            cx, cy = (r["x0"] + r["x1"]) / 2, (r["y0"] + r["y1"]) / 2
            if any(t["bbox"][0] - 2 <= cx <= t["bbox"][2] + 2 and t["bbox"][1] - 1 <= cy <= t["bbox"][3] + 1 for t in tabs):
                continue
            items.append((r["y0"], 1, r))
        items.sort(key=lambda x: (x[0], x[1]))
        got, stop = False, False
        for _, kind, it in items:
            if kind == 0:
                tb = table_block(it)
                if tb:
                    blk, last = tb["block"], (blocks[-1] if blocks else None)
                    if pno != start and not got and last and last["k"] == "table" and last["cols"] == blk["cols"]:
                        # 쪽을 넘어 이어지는 표 → 앞 표에 행을 이어 붙임 (쪽마다 되풀이한 머리 행은 뺌)
                        rows = blk["rows"]
                        if rows and all(c.get("h") for c in rows[0]):
                            if [c["t"] for c in rows[0]] == [c["t"] for c in last["rows"][0]]:
                                rows = [r for r in rows if not all(c.get("h") for c in r)]
                            else:
                                rows = None
                        if rows is not None:
                            last["rows"] += rows
                            if blk.get("items"):
                                last.setdefault("items", []).extend(blk["items"])
                            blk = None
                    if blk:
                        blocks.append(blk)
                    std += tb["std"]
                    prop += tb["prop"]
                    tpl += tb["tpl"]
                    got = True
                prev = None
                continue
            r = it
            t = norm(r["t"])
            if not t or ((r["y0"] < 60 or r["y1"] > H - 75) and PAGE_MARK.match(t)) or contact_header(t):
                continue  # 쪽 머리 단계 표시·쪽번호 (R20), 빈 연락망 머리글
            if ATTACH.match(t) or (pno != start and re.match(r"^[가-하]\s*\.\s*(조치\s*내용|행동\s*요령|대응\s*지침)", t)):
                stop = True
                break
            b = text_block(t, r, prev, pno, right)
            got = True
            if b is None or not b.get("t"):
                continue
            blocks.append(b)
            prev = (b, {**r, "pno": pno})
        if got:
            pages.append(pno)
        if stop:
            break
    return {"blocks": blocks[:150], "pages": pages or [start], "std": std, "prop": prop, "tpl": tpl}


def card_details(cc):
    """R9·R13 프로세스 표에 '-' 줄이 없는 조치의 세부행동 = 카드 표준행동 표, 없으면 번호 제목(그 아래 글머리는 내용)"""
    if cc["std"]:
        return [dict(d) for d in cc["std"]][:20]
    blocks = cc["blocks"]
    has_h = any(b["k"] == "h" for b in blocks)
    out, cur = [], None
    for b in blocks:
        if b["k"] == "h" or (not has_h and b["k"] == "p" and b["lv"] == 1):
            cur = {"title": b["t"], "content": "", "note": b.get("note", "")}
            out.append(cur)
        elif cur is not None and b["k"] == "p" and b["lv"] >= 1:
            pre = {1: "", 2: "- ", 3: "· "}[b["lv"]] if has_h else ("" if b["lv"] == 2 else "· ")
            cur["content"] = (cur["content"] + NL if cur["content"] else "") + pre + b["t"]
    return [d for d in out if d["title"]][:15]


def orgs_of(c):
    def split(s):
        return [x for x in (scrub(v).strip("-–— ") for v in re.split(r"[,，]", s or "")) if x]
    return {"lead": scrub(c["lead"]).strip("-–— ") or None, "support": split(c["support"]) or None, "collab": split(c["collab"]) or None}


GROUP_RANK = {"초기대응부서": 0, "협업부서": 1, "유관기관": 2, "지휘부": 3}


def group_for_card(c, groups, man):
    """프로세스 표에 없는 카드의 부서 칸 — 카드 주관부서가 든 행 묶음, 없으면 그 부서 이름으로 새 묶음"""
    leads = orgs_of(c)["lead"] or ""
    names = [x.strip() for x in re.split(r"[,，]", leads) if x.strip()]
    for lead in names:
        k = squash(re.sub(r"\(.*?\)", "", lead))
        if len(k) < 2:
            continue
        for g in sorted(groups, key=lambda g: GROUP_RANK.get(g["kind"], 9)):
            if g["kind"] == "지휘부":
                continue
            gn = squash(g["name"])
            if k in gn or (len(gn) >= 3 and gn in k):
                return g
    name = names[0] if names else "주관부서 미기재"
    g = next((x for x in groups if x.get("cardOnly") and x["name"] == name), None)
    if g:
        return g
    kind = "협업부서" if re.search(r"(과|실|관|단|팀|센터|사업소|읍|면|동)$", name) else "유관기관"
    g = {"id": f"g{len(groups) + 1}", "name": name, "kind": kind, "fn": None, "pdf": c["pdf"], "page": c["pdf"] - man["offset"],
         "mine": man["mine"] in squash(name), "cardOnly": True}
    groups.append(g)
    return g


def name_sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    def k(x):
        return squash(x).replace("·", "")
    def nop(x):
        return k(re.sub(r"\([^)]*\)", "", x))
    s = max(SequenceMatcher(None, k(a), k(b)).ratio(), SequenceMatcher(None, nop(a), nop(b)).ratio())
    # 한쪽 이름이 다른 쪽에 통째로 들어 있으면 (괄호 보충·덧붙인 말 차이) 같은 조치로 봄
    sa, sb = nop(a), nop(b)
    if min(len(sa), len(sb)) >= 6 and (sa in sb or sb in sa):
        s = max(s, 0.85)
    return s


def match_card(a, cards):
    """프로세스 표 조치 ↔ 행동카드 (②). 코드로 짝을 맞추되, 카드 번호가 표와 다르게 매겨진 매뉴얼(부산 3·4단계)이
    있어 조치 이름도 함께 본다. 제목·순서·세부행동은 표, 기관·쪽은 카드 (애매한 경우 규칙)."""
    first = a["code"].split(",")[0]
    best, best_s = None, 0.0
    for i, c in enumerate(cards):
        s = max(name_sim(a["name"], c["name"]), name_sim(a["name"], c["summary"]))
        hit = first in c["code"].split(",")
        same_step = c["step"] == a["step"]
        if hit and same_step and s >= 0.4:
            score = 2 + s
        elif same_step and s >= 0.8:
            score = 1 + s
        elif hit and s >= 0.6:  # R22 단계 표기가 다른 카드
            score = 0.5 + s
        else:
            continue
        if score > best_s:
            best, best_s = i, score
    return best


def step_goals(doc, pno):
    """단계별 '가. 대응 지침' ❍ 항목 (다음 '나.' 머리 전까지)"""
    rows = merge_rows([l for l in page_lines(doc[pno - 1])])
    rows.sort(key=lambda r: (round(r["y0"]), r["x0"]))
    out, on, in_note = [], False, False
    for r in rows:
        t = norm(r["t"])
        if re.search(r"대응\s*지침", t):
            on = True
            continue
        if not on:
            continue
        if re.match(r"^나\s*\.", t):
            break
        if re.match(r"^[❍○◯●]", t):
            out.append(scrub(re.sub(r"^[❍○◯●]\s*", "", t)))
            in_note = False
        elif t.startswith("※"):
            in_note = True  # ※ 보충 설명과 그 이음 줄은 지침 항목에 넣지 않음
        elif out and t and not in_note and not re.match(r"^[-\d]", t):
            out[-1] = norm(out[-1] + " " + scrub(t))
    return [o for o in out if o]


# ---------------------------------------------------------------- 매뉴얼 1종
def build_manual(pdf_dir: Path, man, dump=None):
    doc = pymupdf.open(pdf_dir / man["file"])
    warn = []
    groups, missions, actions = [], [], []
    step_info = [{"phaseLabel": "", "tablePdf": None} for _ in range(4)]
    for pno, kind in man["table"]:
        pg = doc[pno - 1]
        lines = page_lines(pg)
        cells, grays = table_cells(pg)
        # 머리 행: '1단계' 글이 든 칸
        heads = [ln for ln in lines if re.match(r"^\s*[1-4]\s*단계\s*$", ln["t"])]
        head_y1 = max((h["y1"] for h in heads), default=0) + 6
        for c in cells:
            if c["y0"] < head_y1 - 1:
                # 단계명 (원문) — 'N단계' 번호 칸은 건너뜀, 위기경보 칸(관심·주의·경계·심각·★)은 뺌 (D19)
                ls = [l for l in lines if inside(l, c) and l["t"].strip() not in ("관심", "주의", "경계", "심각", "★", "■")]
                txt = norm(" ".join(l["t"] for l in sorted(ls, key=lambda l: (round(l["y0"]), l["x0"]))))
                if txt and not re.fullmatch(r"[1-4]단계", squash(txt)):
                    if not step_info[c["col"]]["phaseLabel"]:
                        step_info[c["col"]]["phaseLabel"] = txt
                    step_info[c["col"]]["tablePdf"] = step_info[c["col"]]["tablePdf"] or pno
        body_cells = [c for c in cells if c["y0"] >= head_y1 - 1]
        bands = split_bands(cells, grays, head_y1)
        x_first = min(c["x0"] for c in body_cells if c["col"] == 0)
        for bi, (y0, y1) in enumerate(bands):
            gx = [g["x1"] for g in grays if g["y0"] < y1 - 2 and g["y1"] > y0 + 2 and g["x1"] < x_first]
            label_right = max(gx) if gx else x_first - 3
            labels = label_text(lines, label_right, y0, y1)
            if not labels:
                warn.append({"page": pno - man["offset"], "reason": "부서 칸 이름 없음"})
                continue
            gkind = kind[bi] if isinstance(kind, list) and bi < len(kind) else (kind if isinstance(kind, str) else "협업부서")
            fn = None
            if gkind == "초기대응부서":
                rest = [x for x in labels if squash(x) != "초기대응부서"]
                gname = " · ".join(rest) if rest else labels[-1]
            elif gkind == "지휘부" and len(labels) > 1:
                # '시장 | 부재 시 부시장' → '시장 (부재 시 부시장)'
                gname = f"{labels[0]} ({labels[1]})" if "부재" in labels[1] else " · ".join(labels)
            else:
                gname = labels[-1]
                if len(labels) > 1:
                    fn = " ".join(labels[:-1])  # 협업기능 (영천 ⑬ 재난수습홍보 등)
            gid = f"g{len(groups) + 1}"
            g = {"id": gid, "name": gname, "kind": gkind, "fn": fn, "pdf": pno, "page": pno - man["offset"],
                 "mine": gkind != "지휘부" and man["mine"] in squash(gname)}
            groups.append(g)
            bcells = [c for c in body_cells if y0 - 2 <= (c["y0"] + c["y1"]) / 2 <= y1 + 2]
            for col in range(4):
                ccells = sorted([c for c in bcells if c["col"] == col], key=lambda c: c["y0"])
                parser = None
                prev_right = label_right + 1 if col == 0 else max([c2["x1"] for c2 in bcells if c2["col"] == col - 1] + [0]) - 2
                for c in ccells:
                    sub_ls = [l for l in lines if l["x1"] <= c["x0"] + 3 and l["x0"] >= max(prev_right, c["x0"] - 46) and c["y0"] - 1 <= (l["y0"] + l["y1"]) / 2 <= c["y1"] + 1]
                    if col == 0 and c["x0"] - label_right < 12:
                        sub_ls = []
                    # 하위 칸 이름: 세로쓰기 낱글자는 붙이고, 여러 줄 낱말('기획/인사/총무/예산')은 띄어 씀
                    parts = [norm(l["t"]) for l in sorted(sub_ls, key=lambda l: (l["y0"], l["x0"]))]
                    sub = "".join(parts) if parts and all(len(x) <= 1 for x in parts) else norm(" ".join(parts))
                    if not re.search(r"[가-힣A-Za-z]", sub):  # 열 사이 화살표(→)는 하위 칸 이름이 아님
                        sub = ""
                    cl = merge_rows([l for l in lines if inside(l, c)])
                    if not cl:
                        continue
                    # 같은 부서·단계 안에서 하위 칸(공통/부서별/도로…)마다 따로
                    parser = CellParser(man, col, g, sub, pno, warn)
                    for r in cl:
                        parser.feed(r["t"], r, c)
                    parser.finish()
                    for m in parser.missions:
                        m.update({"step": col, "group": gid, "sub": sub, "pdf": pno})
                        missions.append(m)
                    for a in parser.actions:
                        a.update({"step": col, "group": gid, "sub": sub, "pdf": pno})
                        actions.append(a)
    # ---- 행동카드 연결
    tables = PageTables(doc)
    cards = scan_cards(doc, man, tables)
    contents = {}

    def content(ci):
        if ci not in contents:
            contents[ci] = card_content(doc, tables, cards[ci], cards[ci + 1] if ci + 1 < len(cards) else None, man)
        return contents[ci]

    used_cards = set()

    def link(a, ci):
        c = cards[ci]
        used_cards.add(ci)
        a["card"], a["cardIdx"] = c, ci
        if not a["name"].strip() and c["name"]:  # 표에 번호만 있고 제목이 없는 조치 → 카드 조치목록
            a["name"], cond = take_condition(c["name"])
            a["condition"] = a["condition"] or cond
        if not a["details"]:  # R9 프로세스 표에 - 줄이 없으면 카드 본문
            a["details"] = card_details(content(ci))
            a["detailsFrom"] = "card"
        # R7 이름 없는 임무 = 카드 조치목록 ('(필요시)통제활동'처럼 조건이 붙어 있으면 R8)
        if a["mission"]["implicit"] and not a["mission"]["name"] and c["name"]:
            n, cond = take_condition(c["name"])
            a["mission"]["name"] = n
            if cond and not a["mission"].get("condition"):
                a["mission"]["condition"] = cond

    pending = []
    for a in actions:
        if not a["code"]:
            continue
        ci = match_card(a, cards)
        if ci is None:
            pending.append(a)
        else:
            link(a, ci)
    # 코드·단계가 같은데 이름이 달라 못 짝지은 조치 — 이름으로 다른 조치와 짝이 된 카드는 빼고 (부산 3·4단계 번호 어긋남)
    free = set(range(len(cards))) - used_cards
    for a in pending:
        first = a["code"].split(",")[0]
        cand = [i for i in free if cards[i]["step"] == a["step"] and first in cards[i]["code"].split(",")]
        if cand:
            link(a, max(cand, key=lambda i: name_sim(a["name"], cards[i]["name"])))
    linked = len(used_cards)
    # 프로세스 표에 없는 카드는 그 단계 끝에 붙임 (report4 '애매한 경우') — 카드 주관부서의 행 묶음에
    co_mis = {}
    for ci, c in enumerate(cards):
        if ci in used_cards or c["step"] is None or not c["code"]:
            continue
        g = group_for_card(c, groups, man)
        key = (g["id"], c["step"])
        if key not in co_mis:
            co_mis[key] = {"code": None, "name": "행동카드에만 있는 조치", "condition": "", "implicit": False, "cardOnly": True,
                           "notes": [], "step": c["step"], "group": g["id"], "sub": "", "pdf": c["pdf"]}
            missions.append(co_mis[key])
        name, cond = take_condition(c["name"] or c["summary"])
        actions.append({"code": c["code"], "raw": "", "name": name or c["code"], "mission": co_mis[key], "condition": cond, "notes": [],
                        "details": card_details(content(ci)), "detailsFrom": "card", "coded": True, "changed": False, "order": 0,
                        "step": c["step"], "group": g["id"], "sub": "", "pdf": c["pdf"], "card": c, "cardIdx": ci, "fromCard": True})
        used_cards.add(ci)
    for m in missions:
        if m["implicit"] and not m["name"] and m["code"]:
            # 같은 부서 다른 단계에 같은 번호 임무가 있으면 그 이름
            twin = next((x for x in missions if x is not m and x["group"] == m["group"] and x["code"] == m["code"] and x["name"] and not x["implicit"]), None)
            if twin:
                m["name"] = twin["name"]
    for m in missions:
        if m["implicit"] and not m["name"]:
            m["name"] = f"{m['code']}" if m["code"] else "조치"
            warn.append({"page": m["pdf"] - man["offset"], "reason": f"임무 {m['code']} 이름 없음(카드 없음)"})
    # 임무 전체에 붙은 조건은 그 임무의 조치에도 (R8·R23)
    for a in actions:
        if not a["condition"] and a["mission"].get("condition"):
            a["condition"] = a["mission"]["condition"]
    # ---- JSON 모양
    step_out = []
    for i, s in enumerate(step_info):
        gp = man["goals"][i]
        step_out.append({"step": STEPS[i], "no": i + 1, "phaseLabel": s["phaseLabel"].replace(" · ", "·"),
                         "tablePdfPage": s["tablePdf"], "goals": step_goals(doc, gp), "goalPdfPage": gp, "goalPage": gp - man["offset"]})
    recommend = [{"level": r["level"], "step": STEPS[r["step"]], "basis": r["basis"], "pdfPage": r["pdf"], "page": r["pdf"] - man["offset"]}
                 for r in man["recommend"]]
    mis_out, mid, used_keys = [], {}, set()
    for k, m in enumerate(missions):
        key = f"{STEPS[m['step']]}:{m['group']}:{m['sub']}:{m['code'] or 'n' + str(k)}"
        if key in used_keys:
            key += f":{k}"
        used_keys.add(key)
        mid[id(m)] = key
        mis_out.append({"id": key, "code": m["code"], "name": m["name"], "step": STEPS[m["step"]], "group": m["group"],
                        "sub": m["sub"] or None, "condition": m["condition"] or None, "notes": [scrub(x) for x in m.get("notes", [])] or None,
                        # 번호·소제목 없이 기호 줄만 있는 칸에 붙인 '{부서} 조치' 임무 — 화면에서 머리를 숨김
                        "auto": bool(m["implicit"] and not m["code"]) or None,
                        # 프로세스 표에 없는 행동카드를 단계 끝에 붙인 묶음
                        "cardOnly": m.get("cardOnly") or None})
    act_out, seen = [], set()
    for k, a in enumerate(actions):
        aid = f"{STEPS[a['step']][0:2]}-{a['group']}-{a['code'] or 'u' + str(k)}"
        while aid in seen:
            aid += "b"
        seen.add(aid)
        c = a.get("card")
        page_pdf = c["pdf"] if c else a["pdf"]
        act_out.append({
            "id": aid, "code": a["code"], "name": scrub(a["name"]), "mission": mid[id(a["mission"])], "step": STEPS[a["step"]],
            "group": a["group"], "sub": a["sub"] or None, "condition": a["condition"] or None,
            "notes": [scrub(x) for x in a["notes"] if scrub(x)] or None, "changed": a["changed"] or None,
            "details": [{"seq": i + 1, "title": scrub(d["title"]),
                         **({"content": scrub(d["content"])} if scrub(d.get("content", "")) else {}),
                         **({"note": scrub(d["note"])} if scrub(d.get("note", "")) else {})}
                        for i, d in enumerate([d for d in a["details"] if scrub(d["title"])])],
            "detailsFrom": a.get("detailsFrom"),
            "summary": scrub(c["summary"]) if c and c["summary"] else None,
            "orgs": orgs_of(c) if c else None,
            "card": f"k{a['cardIdx'] + 1}" if c else None,
            "fromCard": a.get("fromCard") or None,
            "page": page_pdf - man["offset"], "pdfPage": page_pdf, "tablePage": a["pdf"] - man["offset"], "tablePdfPage": a["pdf"],
        })
    card_out = []
    for ci in sorted(used_cards):
        c, cc = cards[ci], content(ci)
        res = list(dict.fromkeys(p["kind"] for p in cc["prop"] if p.get("kind")))
        card_out.append({
            "id": f"k{ci + 1}", "code": c["code"], "name": scrub(c["name"]), "summary": scrub(c["summary"]) or None,
            "phase": norm(c["tag"]) or None, "orgs": orgs_of(c), "link": scrub(c["link"]).strip("-–— ") or None,
            "pdfPage": c["pdf"], "page": c["pdf"] - man["offset"], "pdfPages": cc["pages"],
            "blocks": cc["blocks"],
            "propagation": cc["prop"] or None,
            "templates": [{k: v for k, v in t.items() if v} for t in cc["tpl"]] or None,
            "resources": res or None,
        })
    out = {k: man[k] for k in ("id", "region", "manualId", "title", "short", "file", "offset", "style", "mine")}
    out.update({"pageCount": doc.page_count, "steps": step_out, "recommend": recommend, "groups": groups, "missions": mis_out,
                "actions": act_out, "cards": card_out, "warnings": warn,
                "stats": {"cards": len(cards), "linked": linked, "cardOnly": len(used_cards) - linked}})
    if dump:
        dump_manual(out, cards, Path(dump))
    return out


def dump_manual(m, cards, dump: Path):
    dump.mkdir(parents=True, exist_ok=True)
    L = []
    gname = {g["id"]: g for g in m["groups"]}
    for g in m["groups"]:
        L.append(f"\n######## {g['id']} {g['name']} [{g['kind']}] p.{g['page']} mine={g['mine']}")
        for st in STEPS:
            ms = [x for x in m["missions"] if x["group"] == g["id"] and x["step"] == st]
            if not ms:
                continue
            L.append(f"  == {st}")
            for x in ms:
                L.append(f"    [{x['code'] or '-'}] {x['name']}{'  <' + x['sub'] + '>' if x['sub'] else ''}{'  {' + x['condition'] + '}' if x['condition'] else ''}")
                for a in [a for a in m["actions"] if a["mission"] == x["id"]]:
                    o = a.get("orgs") or {}
                    L.append(f"       {a['code'] or '·':10s} {a['name']}{'  {' + a['condition'] + '}' if a['condition'] else ''}  | 주관={o.get('lead')} p.{a['page']}{' ' + a['detailsFrom'] if a.get('detailsFrom') else ''}{' 카드=' + a['card'] if a.get('card') else ''}{' (카드만)' if a.get('fromCard') else ''}")
                    for d in a["details"]:
                        L.append(f"           - {d['title']}" + (f"  ⟶ {d['content'][:80]!r}" if d.get("content") else ""))
                    for n in a.get("notes") or []:
                        L.append(f"           ※ {n}")
    (dump / f"{m['region']}_tree.txt").write_text("\n".join(L), encoding="utf-8")
    (dump / f"{m['region']}_cards.txt").write_text("\n".join(f"p{c['pdf']} step={c['step']} code={c['code']!r} raw={c['codeRaw']!r} tag={c['tag']!r} | {c['name']} | 내용={c['summary']} | 주관={c['lead']} | 지원={c['support']} | 협업={c['collab']} | 연계={c['link']}" for c in cards), encoding="utf-8")
    C = []
    for k in m["cards"]:
        users = [a["code"] + " " + a["name"] + (" (카드만)" if a.get("fromCard") else "") for a in m["actions"] if a.get("card") == k["id"]]
        C.append(f"\n==== {k['id']} 카드 {k['code']} {k['name']} · p.{','.join(map(str, k['pdfPages']))} · 조치내용={k['summary']} · 연계={k['link']}")
        C.append(f"     조치: {' / '.join(users)}")
        if k.get("resources"):
            C.append(f"     필요자원: {', '.join(k['resources'])}")
        C.append(card_text(k))
    (dump / f"{m['region']}_cardbody.txt").write_text("\n".join(C), encoding="utf-8")


def card_text(card) -> str:
    """검토용 카드 본문 글 (화면 lib/sop.ts cardText 와 같은 모양)"""
    L = []
    for b in card["blocks"]:
        if b["k"] == "h":
            L.append(f"{b['n']}. {b['t']}" + (f"  ※ {b['note']}" if b.get("note") else ""))
        elif b["k"] == "p":
            mark = (b["sym"] + " ") if b.get("sym") else {0: "", 1: "○ ", 2: "- ", 3: "· "}[b["lv"]]
            L.append("  " * b["lv"] + mark + b["t"].replace(NL, NL + "  " * (b["lv"] + 1)))
        elif b["k"] == "note":
            L.append(f"  {b.get('sym', '※')} {b['t']}")
        else:
            L.append(f"  [표 {b['role']}]")
            for row in b["rows"]:
                L.append("   | " + " | ".join(c["t"].replace(NL, "⏎") + (f"<{c.get('rs', 1)}x{c.get('cs', 1)}>" if c.get("rs") or c.get("cs") else "") + ("*" if c.get("h") else "") for c in row))
    return NL.join(L)


def main():
    pdf_dir, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    dump = sys.argv[sys.argv.index("--dump") + 1] if "--dump" in sys.argv else None
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    res = []
    for man in MANUALS:
        if only and man["region"] != only:
            continue
        m = build_manual(pdf_dir, man, dump)
        res.append(m)
        s = m["stats"]
        print(f"{m['region']}: 부서 {len(m['groups'])} · 임무 {len(m['missions'])} · 조치 {len(m['actions'])} · 카드 {s['cards']}장 (표와 짝 {s['linked']} · 단계 끝에 붙임 {s['cardOnly']}) · 경고 {len(m['warnings'])}")
    if not only:
        out_path.write_text(json.dumps({"rules": "report4 mapping.html R1~R25", "manuals": res}, ensure_ascii=False, indent=1), encoding="utf-8")
        print("저장:", out_path)


if __name__ == "__main__":
    main()
