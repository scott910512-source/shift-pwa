# -*- coding: utf-8 -*-
"""
4조 2교대 근무표 — PC 바탕화면 생성기 (Windows)

  화면 전체를 쓰는 대시보드를 그려 바탕화면으로 지정한다.
    · 왼쪽 위  : 오늘 주간(왼) / 야간(오른) 근무조와 공장별 명단
    · 왼쪽 아래: 이번 달 달력 — 날짜마다 주간·야간 조 표기
    · 오른쪽   : 전체 근무자 명단 (조별 + 상근)

  명단은 배포된 crew.json 을 받아 쓴다. 인터넷이 막혀 있으면
  마지막으로 받아둔 값을, 그것도 없으면 아래 내장 명단을 쓴다.

필요한 것:  Python 3.8+ ,  pip install pillow

사용법:
  python wallpaper.py                 # 이미지 생성 + 바탕화면 지정
  python wallpaper.py --no-set        # 이미지만 생성 (지정하지 않음)
  python wallpaper.py --out a.png --size 1920x1080 --now 2026-09-15T03:00
  python wallpaper.py --icon-cols 3   # 아이콘이 세 줄이면 그만큼 더 비운다
  python wallpaper.py --install       # 이미지 생성 + 작업 스케줄러 등록
  python wallpaper.py --uninstall     # 자동 갱신 해제
  python wallpaper.py --diag          # 왜 안 바뀌는지 점검
  python wallpaper.py --online        # 최신 명단을 받아온다 (기본은 내장 명단)
"""

import calendar
import ctypes
import io
import json
import math
import os
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

# 명단은 아래 FALLBACK 에 전부 들어 있어서 인터넷이 없어도 그대로 돈다.
# 사내망에서 막히면 기다리기만 하고 얻는 게 없으므로 기본은 접속하지 않는다.
# 최신 명단을 받아오고 싶을 때만 --online 을 붙인다.
USE_NETWORK = False
CREW_URL = "https://scott910512-source.github.io/shift-pwa/crew.json"

# 바탕화면 아이콘이 가리지 않도록 왼쪽을 몇 칸 비워 둘지.
# 윈도우 아이콘은 왼쪽 위부터 세로로 쌓이므로 그 폭만큼 피해서 그린다.
# 아이콘이 두 줄(열)을 넘어가면 3, 4 로 올리면 된다. 0 이면 꽉 채운다.
# 실행할 때 --icon-cols 3 처럼 바꿔 줄 수도 있다.
ICON_COLS = 2
ICON_COL_W = 112            # 아이콘 한 열의 폭 (1080p 기준, 보통 크기 아이콘)

# ───────────────────────── 근무 패턴 (웹앱·위젯과 동일) ─────────────────────────

import datetime as _dt

TEAMS = ["A", "B", "C", "D"]
BLOCKS = [("D", "B"), ("C", "A"), ("B", "D"), ("A", "C")]
ANCHOR = _dt.date(2026, 8, 27)   # 사이클 0일차 (웹앱·위젯과 같은 기준일)
DOW = "월화수목금토일"            # date.weekday(): 0=월


def shift_of(d):
    """date -> (주간조, 야간조, 블록내 일차, 휴무조들)"""
    n = (d - ANCHOR).days        # 파이썬 //, % 는 음수에서도 내림이라 과거 날짜도 맞다
    day, night = BLOCKS[(n // 3) % 4]
    nth = n % 3 + 1
    off = [t for t in TEAMS if t not in (day, night)]
    return day, night, nth, off


def block_index(d):
    """3일 묶음 번호. 달력에서 묶음끼리 배경색을 번갈아 주는 데 쓴다."""
    return (d - ANCHOR).days // 3


def current_view(now):
    """지금 화면에 뭘 보여줄지. 00:00~08:00 은 야간이 어제 시작분이다."""
    today = now.date()
    dawn = now.hour < 8
    night_date = today - _dt.timedelta(days=1) if dawn else today
    day_team, _, nth, _ = shift_of(today)
    _, night_team, _, _ = shift_of(night_date)
    off = [t for t in TEAMS if t not in (day_team, night_team)]
    kind = "day" if 8 <= now.hour < 20 else "night"
    return {
        "date": today, "nth": nth, "dawn": dawn, "kind": kind,
        "day": day_team, "night": night_team, "night_date": night_date, "off": off,
    }


def now_kst():
    return _dt.datetime.now(_dt.timezone(_dt.timedelta(hours=9))).replace(tzinfo=None)


# ───────────────────────────────── 명단 ─────────────────────────────────

PLANTS = ["1", "2", "3"]

# FALLBACK:START — tools/sync-crew.js 가 자동으로 고쳐 쓴다. 손으로 고치지 말 것.
FALLBACK = {
  "crews": {
    "A": {"leader": "노용수", "factories": {
      "1": ["곽대력", "송상현", "문정중"],
      "2": ["하형만", "박성현", "진영욱"],
      "3": ["곽정재", "민경찬", "구태현", "여형진"]}},
    "B": {"leader": "조한석", "factories": {
      "1": ["김태진", "어하진", "황영수"],
      "2": ["안민호", "장예닮", "김재섭"],
      "3": ["김동희", "송재익", "이현식", "김동주"]}},
    "C": {"leader": "김민규", "factories": {
      "1": ["김혁순", "김병로", "김문수"],
      "2": ["박광현", "전규석", "이재서"],
      "3": ["김인회", "김석규", "장주원", "박현석"]}},
    "D": {"leader": "김명수", "factories": {
      "1": ["정경훈", "정영훈", "이원준"],
      "2": ["백정욱", "김병섭", "박상준"],
      "3": ["양진리", "안윤철", "김지용", "황성호"]}}
  },
  "staff": ["방우석", "류인환", "우두형", "고형진", "고현석", "김윤종"]
}
# FALLBACK:END


def cache_path():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "shift-wallpaper")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "crew.json")


def normalize(raw):
    crews = {}
    src = (raw or {}).get("crews") or {}
    for t in TEAMS:
        c = src.get(t) or {}
        fx = c.get("factories") or {}
        crews[t] = {
            "leader": str(c.get("leader") or "").strip(),
            "factories": {p: [str(x).strip() for x in (fx.get(p) or []) if str(x).strip()]
                          for p in PLANTS},
        }
    staff = [str(x).strip() for x in ((raw or {}).get("staff") or []) if str(x).strip()]
    return {"crews": crews, "staff": staff}


def has_names(crew):
    """공장 명단이 하나라도 들어 있는지. 껍데기만 받은 경우를 걸러낸다."""
    return any(crew["crews"][t]["factories"][p] for t in TEAMS for p in PLANTS)


def load_crew(url, online=USE_NETWORK):
    """내장 명단을 쓴다. --online 일 때만 최신 → 저장본 → 내장 순으로 시도한다."""
    if not online:
        return normalize(FALLBACK), "내장"
    path = cache_path()
    try:
        if url.startswith(("http://", "https://")):
            with urllib.request.urlopen(url, timeout=8) as r:
                raw = json.loads(r.read().decode("utf-8"))
        else:
            with open(url, encoding="utf-8") as f:
                raw = json.load(f)
        got = normalize(raw)
        if has_names(got):
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(raw, f, ensure_ascii=False)
            except OSError:
                pass
            return got, "최신"
    except Exception:
        # 사내망 SSL 검사 등으로 막히는 일이 있다. 내장 명단으로 조용히 넘어간다.
        pass
    try:
        with open(path, encoding="utf-8") as f:
            got = normalize(json.load(f))
        if has_names(got):
            return got, "저장본"
    except Exception:
        pass
    return normalize(FALLBACK), "내장"


# ───────────────────────────────── 글꼴 ─────────────────────────────────

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\malgunbd.ttf",       # 맑은 고딕 굵게
    r"C:\Windows\Fonts\malgun.ttf",         # 맑은 고딕
    r"C:\Windows\Fonts\NanumGothicBold.ttf",
    r"C:\Windows\Fonts\gulim.ttc",
    "/usr/local/lib/python3.11/dist-packages/koreanize_matplotlib/fonts/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
]
FONT_CANDIDATES_REG = [
    r"C:\Windows\Fonts\malgun.ttf",
    r"C:\Windows\Fonts\NanumGothic.ttf",
    r"C:\Windows\Fonts\gulim.ttc",
    "/usr/local/lib/python3.11/dist-packages/koreanize_matplotlib/fonts/NanumGothic.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
]


def pick_font(override=None):
    bold = reg = None
    if override:
        bold = reg = override
    else:
        for p in FONT_CANDIDATES:
            if os.path.exists(p):
                bold = p
                break
        for p in FONT_CANDIDATES_REG:
            if os.path.exists(p):
                reg = p
                break
    if not bold and not reg:
        raise SystemExit("한글 글꼴을 찾지 못했습니다. --font 로 ttf 경로를 지정하세요.")
    return bold or reg, reg or bold


# ───────────────────────────────── 색 ─────────────────────────────────

BG       = (10, 14, 20)
PANEL    = (23, 29, 37)
PANEL2   = (28, 35, 45)
PANEL3   = (33, 41, 52)
LINE     = (44, 55, 70)
FG       = (232, 238, 244)
MUTE     = (152, 163, 177)
DIM      = (104, 115, 127)
DAY_C    = (240, 173, 60)
DAY_BG   = (44, 33, 15)
NIGHT_C  = (125, 153, 247)
NIGHT_BG = (21, 29, 52)
TODAY_BG = (36, 50, 40)
TODAY_C  = (92, 208, 136)
SAT_C    = (126, 168, 232)
SUN_C    = (232, 124, 124)

TEAM_C = {"A": (240, 173, 60), "B": (125, 153, 247),
          "C": (92, 208, 136), "D": (226, 130, 196)}


def draw_sun(dr, cx, cy, r, color):
    w = max(2, int(r / 5))
    dr.ellipse([cx - r * .55, cy - r * .55, cx + r * .55, cy + r * .55], outline=color, width=w)
    for i in range(8):
        a = math.radians(i * 45)
        dr.line([cx + math.cos(a) * r * .82, cy + math.sin(a) * r * .82,
                 cx + math.cos(a) * r * 1.18, cy + math.sin(a) * r * 1.18], fill=color, width=w)


def draw_moon(dr, cx, cy, r, color, bg):
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    dr.ellipse([cx - r * .45, cy - r * 1.25, cx + r * 1.55, cy + r * .75], fill=bg)


# ───────────────────────────────── 그리기 ─────────────────────────────────

def fit(dr, text, path, size, maxw, floor=9):
    """maxw 안에 들어올 때까지 글꼴을 줄인다. 이름이 잘리는 것보다 낫다."""
    size = int(size)
    while size > floor:
        fnt = ImageFont.truetype(path, size)
        if dr.textlength(text, font=fnt) <= maxw:
            return fnt
        size -= 1
    return ImageFont.truetype(path, max(floor, size))


def build_image(view, crew, size, fonts, source, icon_cols=ICON_COLS):
    W, H = size
    bold, reg = fonts
    s = H / 1080.0                                   # 1080p 기준 배율
    S = lambda v: max(1, int(round(v * s)))
    F = lambda p, sz: ImageFont.truetype(p, max(10, int(sz * s)))

    img = Image.new("RGB", (W, H), BG)
    dr = ImageDraw.Draw(img)

    M = S(38)                                        # 바깥 여백
    G = S(20)                                        # 패널 사이 간격
    gutter = S(ICON_COL_W) * max(0, icon_cols)       # 왼쪽 아이콘 자리
    RW = int(min(W * 0.27, S(430)))                  # 오른쪽 전체 명단 폭
    LW = W - M * 2 - RW - G - gutter                 # 왼쪽 폭
    LX, RX, TOP = M + gutter, W - M - RW, M
    BOT = H - M

    # ── 1. 머리말 ──────────────────────────────────────────────────────
    d = view["date"]
    f_brand = F(reg, 22)
    f_date = F(bold, 52)
    f_meta = F(reg, 23)

    dr.text((LX, TOP), "4조 2교대 근무표", font=f_brand, fill=DIM)
    y = TOP + S(32)
    label = "%d년 %d월 %d일 (%s)" % (d.year, d.month, d.day, DOW[d.weekday()])
    dr.text((LX, y), label, font=f_date, fill=FG)
    lw = dr.textlength(label, font=f_date)
    dr.text((LX + lw + S(18), y + S(24)),
            "%d일차  ·  휴무 %s" % (view["nth"], "·".join(t + "조" for t in view["off"])),
            font=f_meta, fill=MUTE)
    head_b = y + S(66)

    # ── 2. 오늘 근무 — 왼쪽 주간 / 오른쪽 야간 ────────────────────────
    card_h = S(268)
    cw = (LW - G) // 2

    def shift_card(x, y, kind, team):
        is_day = kind == "day"
        col = DAY_C if is_day else NIGHT_C
        bg = DAY_BG if is_day else NIGHT_BG
        live = view["kind"] == kind
        dr.rounded_rectangle([x, y, x + cw, y + card_h], radius=S(16), fill=bg,
                             outline=col if live else None, width=S(2) if live else 0)
        px, py = x + S(22), y + S(20)
        iw = cw - S(44)

        r = S(15)
        if is_day:
            draw_sun(dr, px + r, py + r, r, col)
        else:
            draw_moon(dr, px + r, py + r, int(r * .85), col, bg)
        dr.text((px + S(44), py - S(4)), "주간" if is_day else "야간", font=F(bold, 30), fill=col)
        dr.text((px + S(126), py - S(16)), team + "조", font=F(bold, 56), fill=col)

        f_s = F(reg, 20)
        clock = "08:00 – 20:00" if is_day else "20:00 – 08:00"
        tw = dr.textlength(clock, font=f_s)
        dr.text((px + iw - tw, py + S(6)), clock, font=f_s, fill=MUTE if live else DIM)
        if live:
            bw = dr.textlength("● 근무 중", font=f_s)
            dr.text((px + iw - tw - bw - S(18), py + S(6)), "● 근무 중", font=f_s, fill=col)

        yy = py + S(58)
        lead = crew["crews"][team]["leader"]
        dr.text((px, yy + S(5)), "교대조장", font=F(reg, 19), fill=DIM)
        dr.text((px + S(86), yy - S(3)), lead or "미등록", font=F(bold, 30),
                fill=FG if lead else DIM)
        yy += S(48)

        for p in PLANTS:
            names = crew["crews"][team]["factories"][p]
            chw, chh = S(56), S(29)
            dr.rounded_rectangle([px, yy, px + chw, yy + chh], radius=S(6), fill=PANEL2)
            f_p = F(reg, 19)
            plw = dr.textlength(p + "공장", font=f_p)
            dr.text((px + (chw - plw) / 2, yy + S(4)), p + "공장", font=f_p, fill=col)
            txt = "  ".join(names) if names else "미등록"
            dr.text((px + chw + S(14), yy + S(1)),
                    txt, font=fit(dr, txt, bold, 26 * s, iw - chw - S(14)),
                    fill=FG if names else DIM)
            yy += S(38)

    shift_card(LX, head_b, "day", view["day"])
    shift_card(LX + cw + G, head_b, "night", view["night"])
    shift_b = head_b + card_h

    if view["dawn"]:
        nd = view["night_date"]
        dr.text((LX, shift_b + S(6)),
                "※ 야간 %s조는 어제 %d/%d 20:00 시작 · 오늘 08:00 종료"
                % (view["night"], nd.month, nd.day), font=F(reg, 19), fill=DIM)
        shift_b += S(28)

    # ── 3. 달력 — 날짜마다 주간/야간 조 ────────────────────────────────
    cal_y = shift_b + S(24)
    dr.rounded_rectangle([LX, cal_y, LX + LW, BOT], radius=S(16), fill=PANEL)
    cpad = S(18)
    cx0, cy0 = LX + cpad, cal_y + cpad
    cw_in = LW - cpad * 2

    dr.text((cx0, cy0), "%d월" % d.month, font=F(bold, 24), fill=FG)
    f_lg = F(reg, 18)
    lx = cx0 + cw_in
    for lb, lc in (("● 야간", NIGHT_C), ("● 주간", DAY_C)):
        lx -= dr.textlength(lb, font=f_lg)
        dr.text((lx, cy0 + S(4)), lb, font=f_lg, fill=lc)
        lx -= S(18)
    cy0 += S(36)

    cal = calendar.Calendar(firstweekday=0)           # 0 = 월요일
    weeks = cal.monthdatescalendar(d.year, d.month)
    cols, rows = 7, len(weeks)
    colw = cw_in / cols

    f_dow = F(reg, 18)
    for i in range(cols):
        c = SUN_C if i == 6 else (SAT_C if i == 5 else MUTE)
        tw = dr.textlength(DOW[i], font=f_dow)
        dr.text((cx0 + colw * i + (colw - tw) / 2, cy0), DOW[i], font=f_dow, fill=c)
    cy0 += S(26)

    gap = S(4)
    rowh = (BOT - cpad - cy0 - gap * (rows - 1)) / rows
    f_day = F(bold, min(24, rowh / s * 0.30))
    f_cell = F(bold, min(21, rowh / s * 0.26))

    for ri, week in enumerate(weeks):
        for ci, cd in enumerate(week):
            x = cx0 + colw * ci
            y = cy0 + (rowh + gap) * ri
            x1, y1 = x + colw - gap, y + rowh
            other = cd.month != d.month
            today = cd == d
            dyt, ngt, _, _ = shift_of(cd)

            if today:
                fillc = TODAY_BG
            elif other:
                fillc = BG
            else:
                fillc = PANEL3 if block_index(cd) % 2 else PANEL2
            dr.rounded_rectangle([x, y, x1, y1], radius=S(8), fill=fillc,
                                 outline=TODAY_C if today else None, width=S(2) if today else 0)

            dc = DIM if other else (TODAY_C if today else
                                    (SUN_C if ci == 6 else SAT_C if ci == 5 else FG))
            dr.text((x + S(9), y + S(5)), str(cd.day), font=f_day, fill=dc)

            # 3일 묶음 시작일에 왼쪽 세로 막대
            if not other and (cd - ANCHOR).days % 3 == 0:
                dr.rounded_rectangle([x + S(2), y + S(7), x + S(4), y1 - S(7)],
                                     radius=S(1), fill=LINE)

            a = 0.45 if other else 1.0
            mix = lambda c: tuple(int(fillc[i] + (c[i] - fillc[i]) * a) for i in range(3))
            bx = x + colw - gap - S(9)
            for j, (tm, col) in enumerate(((dyt, DAY_C), (ngt, NIGHT_C))):
                t = "주 " + tm if j == 0 else "야 " + tm
                tw = dr.textlength(t, font=f_cell)
                dr.text((bx - tw, y + rowh - S(4) - f_cell.size * (2 - j) - S(2) * (1 - j)),
                        t, font=f_cell, fill=mix(col))

    # ── 4. 오른쪽 — 전체 근무자 ───────────────────────────────────────
    dr.rounded_rectangle([RX, TOP, RX + RW, BOT], radius=S(16), fill=PANEL)
    rpad = S(20)
    rx, ry = RX + rpad, TOP + rpad
    rw = RW - rpad * 2

    dr.text((rx, ry), "전체 근무자", font=F(bold, 26), fill=FG)
    ry += S(40)

    live_teams = {view["day"]: "주간", view["night"]: "야간"}
    f_pl = F(reg, 18)

    for t in TEAMS:
        c = crew["crews"][t]
        col = TEAM_C[t]
        badge = live_teams.get(t)
        dr.rounded_rectangle([rx, ry, rx + S(30), ry + S(26)], radius=S(6), fill=col)
        tw = dr.textlength(t, font=F(bold, 19))
        dr.text((rx + (S(30) - tw) / 2, ry + S(3)), t, font=F(bold, 19), fill=BG)
        dr.text((rx + S(40), ry + S(2)), c["leader"] or "미등록", font=F(bold, 21),
                fill=FG if c["leader"] else DIM)
        if badge:
            bc = DAY_C if badge == "주간" else NIGHT_C
            bw = dr.textlength(badge, font=f_pl)
            dr.rounded_rectangle([rx + rw - bw - S(16), ry + S(2), rx + rw, ry + S(24)],
                                 radius=S(5), fill=DAY_BG if badge == "주간" else NIGHT_BG)
            dr.text((rx + rw - bw - S(8), ry + S(4)), badge, font=f_pl, fill=bc)
        ry += S(32)

        plw = max(dr.textlength(q + "공장", font=f_pl) for q in PLANTS) + S(12)
        for p in PLANTS:
            names = c["factories"][p]
            dr.text((rx + S(2), ry + S(2)), p + "공장", font=f_pl, fill=DIM)
            txt = " ".join(names) if names else "미등록"
            dr.text((rx + S(2) + plw, ry),
                    txt, font=fit(dr, txt, reg, 20 * s, rw - S(2) - plw),
                    fill=MUTE if names else DIM)
            ry += S(27)
        ry += S(12)

    ry += S(4)
    dr.line([rx, ry, rx + rw, ry], fill=LINE, width=S(1))
    ry += S(16)
    dr.text((rx, ry), "상근", font=F(bold, 21), fill=FG)
    dr.text((rx + S(50), ry + S(3)), "교대 없음", font=F(reg, 17), fill=DIM)
    ry += S(30)
    if crew["staff"]:
        per = 3
        for i in range(0, len(crew["staff"]), per):
            txt = "  ".join(crew["staff"][i:i + per])
            dr.text((rx + S(2), ry), txt, font=fit(dr, txt, reg, 20 * s, rw - S(4)), fill=MUTE)
            ry += S(27)
    else:
        dr.text((rx + S(2), ry), "미등록", font=F(reg, 20), fill=DIM)
        ry += S(27)

    stamp = "%02d:%02d 기준 · 명단 %s" % (view["now"].hour, view["now"].minute, source)
    f_st = F(reg, 17)
    dr.text((rx + rw - dr.textlength(stamp, font=f_st), BOT - rpad - S(18)),
            stamp, font=f_st, fill=DIM)
    return img


# ───────────────────────────────── Windows ─────────────────────────────────

def screen_size():
    try:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
        u = ctypes.windll.user32
        return u.GetSystemMetrics(0), u.GetSystemMetrics(1)
    except Exception:
        return 1920, 1080


# 회사 PC 는 정책으로 배경 변경을 막아 두는 일이 많다. 어디서 막혔는지 알려 준다.
POLICY_KEYS = [
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Policies\System", "Wallpaper"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Policies\System", "NoDispBackgroundPage"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", "NoChangingWallPaper"),
    ("HKLM", r"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System", "Wallpaper"),
    ("HKLM", r"SOFTWARE\Policies\Microsoft\Windows\Personalization", "NoChangingWallPaper"),
]


def policy_blocks():
    """배경 변경을 막는 정책이 걸려 있으면 그 목록을 돌려준다."""
    try:
        import winreg
    except ImportError:
        return []
    roots = {"HKCU": winreg.HKEY_CURRENT_USER, "HKLM": winreg.HKEY_LOCAL_MACHINE}
    hits = []
    for r, sub, name in POLICY_KEYS:
        try:
            k = winreg.OpenKey(roots[r], sub)
            try:
                v, _ = winreg.QueryValueEx(k, name)
            finally:
                winreg.CloseKey(k)
        except OSError:
            continue
        if v not in (0, "", None):
            hits.append("%s\\%s\\%s = %r" % (r, sub, name, v))
    return hits


def registered_wallpaper():
    """윈도우가 지금 배경으로 알고 있는 파일 경로."""
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop")
        try:
            return winreg.QueryValueEx(k, "WallPaper")[0]
        finally:
            winreg.CloseKey(k)
    except OSError:
        return ""


def set_wallpaper(path):
    """바탕화면으로 지정하고, 정말 반영됐는지 되읽어서 확인한다.
    돌려주는 값: (성공 여부, 설명)"""
    path = os.path.abspath(path)
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop", 0, winreg.KEY_SET_VALUE)
        try:
            winreg.SetValueEx(k, "WallpaperStyle", 0, winreg.REG_SZ, "10")   # 10 = 채우기
            winreg.SetValueEx(k, "TileWallpaper", 0, winreg.REG_SZ, "0")
        finally:
            winreg.CloseKey(k)
    except Exception:
        pass

    SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE = 20, 1, 2
    called = bool(ctypes.windll.user32.SystemParametersInfoW(
        SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE))

    # 호출이 성공했다고 끝이 아니다. 레지스트리를 되읽어 진짜 바뀌었는지 본다.
    got = registered_wallpaper()
    stuck = os.path.normcase(os.path.normpath(got or "")) == os.path.normcase(path)
    blocks = policy_blocks()

    if stuck and called:
        return True, "완료"
    if blocks:
        return False, ("회사 정책이 배경 변경을 막고 있습니다.\n     막는 설정: "
                       + "\n                " + "\n                ".join(blocks)
                       + "\n     → 전산팀에 문의하거나, 이미지를 직접 배경으로 지정해 보세요:\n     "
                       + path)
    if not stuck:
        return False, ("지정은 했지만 윈도우가 되돌렸습니다. 지금 배경: %s\n     "
                       "다른 프로그램(테마·배경 슬라이드쇼·보안 프로그램)이 덮어쓰는 중일 수 있습니다.\n     "
                       "이미지는 여기 있으니 직접 지정해 보세요:\n     %s" % (got or "(없음)", path))
    return False, "실패"


# ───────────────────────── 작업 스케줄러 (PowerShell 없이) ─────────────────────────

TASK_NAME = "ShiftWallpaper"

TASK_XML = """<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>4jo 2gyodae wallpaper auto update</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T08:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
    <CalendarTrigger>
      <StartBoundary>2020-01-01T20:00:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{exe}</Command>
      <Arguments>{args}</Arguments>
      <WorkingDirectory>{cwd}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"""


def _xml_escape(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def _pythonw():
    """창이 뜨지 않는 pythonw.exe. 없으면 지금 쓰는 파이썬."""
    exe = sys.executable
    w = os.path.join(os.path.dirname(exe), "pythonw.exe")
    return w if os.path.exists(w) else exe


def _run(cmd):
    import subprocess
    r = subprocess.run(cmd, capture_output=True)
    out = (r.stdout + r.stderr).decode("cp949", "replace").strip()
    return r.returncode, out


def install_task():
    """작업 스케줄러에 등록한다. schtasks 만 쓰므로 PowerShell 이 필요 없다."""
    import tempfile
    script = os.path.abspath(__file__)
    exe = _pythonw()
    user = os.environ.get("USERNAME", "")
    domain = os.environ.get("USERDOMAIN", "")
    xml = TASK_XML.format(
        user=_xml_escape(("%s\\%s" % (domain, user)) if domain else user),
        exe=_xml_escape(exe),
        args=_xml_escape('"%s"' % script),
        cwd=_xml_escape(os.path.dirname(script)))

    fd, tmp = tempfile.mkstemp(suffix=".xml")
    os.close(fd)
    try:
        # schtasks /XML 은 UTF-16 파일을 요구한다
        with io.open(tmp, "w", encoding="utf-16") as f:
            f.write(xml)
        code, out = _run(["schtasks", "/Create", "/TN", TASK_NAME, "/XML", tmp, "/F"])
        if code == 0:
            return True, "로그온 시 + 매일 08:00 · 20:00"
        # XML 등록이 막히면 트리거를 따로따로 만든다 (기능은 같고 밀린 실행 따라잡기만 없음)
        tr = '"%s" "%s"' % (exe, script)
        made = []
        for name, args in ((TASK_NAME, ["/SC", "ONLOGON"]),
                           (TASK_NAME + "_0800", ["/SC", "DAILY", "/ST", "08:00"]),
                           (TASK_NAME + "_2000", ["/SC", "DAILY", "/ST", "20:00"])):
            c, o = _run(["schtasks", "/Create", "/TN", name, "/TR", tr, "/F"] + args)
            if c == 0:
                made.append(name)
            else:
                out = o or out
        if made:
            return True, "로그온 시 + 매일 08:00 · 20:00 (작업 %d개)" % len(made)
        return False, out or "schtasks 등록 실패"
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def uninstall_task():
    gone = []
    for name in (TASK_NAME, TASK_NAME + "_0800", TASK_NAME + "_2000"):
        code, _ = _run(["schtasks", "/Delete", "/TN", name, "/F"])
        if code == 0:
            gone.append(name)
    return gone


# ───────────────────────────────── 실행 ─────────────────────────────────

def main():
    args = sys.argv[1:]

    def opt(name, default=None):
        return args[args.index(name) + 1] if name in args else default

    url = opt("--crew", CREW_URL)
    font_override = opt("--font")
    out = opt("--out")
    no_set = "--no-set" in args
    online = "--online" in args or opt("--crew") is not None

    if "--uninstall" in args:
        gone = uninstall_task()
        print("자동 갱신 해제:", ", ".join(gone) if gone else "등록된 작업이 없습니다")
        print("바탕화면 이미지는 그대로 남아 있습니다.")
        return

    if "--diag" in args:
        print("=== 점검 ===")
        print("파이썬     :", sys.executable)
        print("스크립트   :", os.path.abspath(__file__))
        print("화면 크기  : %dx%d" % screen_size())
        print("지금 배경  :", registered_wallpaper() or "(없음)")
        b = policy_blocks()
        print("정책 차단  :", "\n             ".join(b) if b else "없음")
        code, out2 = _run(["schtasks", "/Query", "/TN", TASK_NAME])
        print("등록된 작업:", "있음" if code == 0 else "없음")
        crew0, src0 = load_crew(url, online)
        print("명단       : %s — 조원 %d명, 상근 %d명" %
              (src0, sum(len(crew0["crews"][t]["factories"][p])
                         for t in TEAMS for p in PLANTS), len(crew0["staff"])))
        return

    now = now_kst()
    if opt("--now"):
        now = _dt.datetime.fromisoformat(opt("--now"))

    if opt("--size"):
        w, h = opt("--size").lower().split("x")
        size = (int(w), int(h))
    else:
        size = screen_size()

    crew, source = load_crew(url, online)
    view = current_view(now)
    view["now"] = now

    icon_cols = int(opt("--icon-cols", ICON_COLS))
    img = build_image(view, crew, size, pick_font(font_override), source, icon_cols)

    if not out:
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        dd = os.path.join(base, "shift-wallpaper")
        os.makedirs(dd, exist_ok=True)
        # 같은 파일명으로 덮으면 윈도우가 이전 이미지를 계속 쓰는 일이 있어 번갈아 쓴다
        prev = os.path.join(dd, "current.txt")
        last = ""
        try:
            last = open(prev, encoding="utf-8").read().strip()
        except OSError:
            pass
        name = "wallpaper_b.png" if last.endswith("wallpaper_a.png") else "wallpaper_a.png"
        out = os.path.join(dd, name)
        try:
            open(prev, "w", encoding="utf-8").write(out)
        except OSError:
            pass

    img.save(out)
    print("이미지 저장:", out)
    print("오늘: 주간 %s조 / 야간 %s조 / 휴무 %s · 명단 %s"
          % (view["day"], view["night"], "·".join(view["off"]), source))

    if not no_set and sys.platform.startswith("win"):
        ok, why = set_wallpaper(out)
        print("바탕화면 지정:", why)
    elif not no_set:
        print("바탕화면 지정은 Windows 에서만 동작합니다.")

    if "--install" in args:
        ok, why = install_task()
        if ok:
            print()
            print("자동 갱신 등록 완료 —", why)
            print("  지울 때는 uninstall.bat 을 실행하세요.")
        else:
            print()
            print("자동 갱신 등록 실패:", why)
            print("  바탕화면은 위에 나온 대로 바뀌었습니다. 자동 갱신만 안 걸린 상태입니다.")


if __name__ == "__main__":
    main()
