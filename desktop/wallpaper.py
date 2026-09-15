# -*- coding: utf-8 -*-
"""
4조 2교대 근무표 — PC 바탕화면 생성기 (Windows)

  오늘 주간/야간 근무조와 명단을 그린 이미지를 만들어 바탕화면으로 지정한다.
  명단은 배포된 crew.json 을 받아 쓰므로, 명단이 바뀌면 자동으로 따라온다.
  인터넷이 없으면 마지막으로 받아둔 값을, 그것도 없으면 내장 기본값을 쓴다.

필요한 것:  Python 3.8+ ,  pip install pillow

사용법:
  python wallpaper.py                 # 이미지 생성 + 바탕화면 지정
  python wallpaper.py --no-set        # 이미지만 생성 (지정하지 않음)
  python wallpaper.py --out a.png --size 1920x1080 --now 2026-09-15T03:00
"""

import ctypes
import json
import os
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

CREW_URL = "https://scott910512-source.github.io/shift-pwa/crew.json"

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


def current_view(now):
    """지금 화면에 뭘 보여줄지. 00:00~08:00 은 야간이 어제 시작분이다."""
    import datetime as dt
    today = now.date()
    dawn = now.hour < 8
    night_date = today - dt.timedelta(days=1) if dawn else today
    day_team, _, nth, _ = shift_of(today)
    _, night_team, _, _ = shift_of(night_date)
    off = [t for t in TEAMS if t not in (day_team, night_team)]
    kind = "day" if 8 <= now.hour < 20 else "night"
    return {
        "date": today, "nth": nth, "dawn": dawn, "kind": kind,
        "day": day_team, "night": night_team, "night_date": night_date, "off": off,
    }


def now_kst():
    import datetime as dt
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).replace(tzinfo=None)


# ───────────────────────────────── 명단 ─────────────────────────────────

PLANTS = ["1", "2", "3"]

FALLBACK = {
    "crews": {
        "A": {"leader": "노용수", "factories": {"1": [], "2": ["하형만", "박성현", "진영욱"], "3": []}},
        "B": {"leader": "조한석", "factories": {"1": [], "2": ["안민호", "장예닮", "김재섭"], "3": []}},
        "C": {"leader": "김민규", "factories": {"1": [], "2": ["박광현", "전규석", "이재서"], "3": []}},
        "D": {"leader": "김명수", "factories": {"1": [], "2": ["백정욱", "김병섭", "박상준"], "3": []}},
    },
    "staff": [],
}


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


def load_crew(url):
    """최신 → 저장본 → 내장 기본값 순으로 시도한다."""
    path = cache_path()
    try:
        if url.startswith(("http://", "https://")):
            with urllib.request.urlopen(url, timeout=8) as r:
                raw = json.loads(r.read().decode("utf-8"))
        else:
            with open(url, encoding="utf-8") as f:
                raw = json.load(f)
        if raw.get("crews"):
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(raw, f, ensure_ascii=False)
            except OSError:
                pass
            return normalize(raw), "최신"
    except Exception:
        pass
    try:
        with open(path, encoding="utf-8") as f:
            return normalize(json.load(f)), "저장본"
    except Exception:
        pass
    return normalize(FALLBACK), "기본값"


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


# ───────────────────────────────── 그리기 ─────────────────────────────────

BG      = (10, 14, 20)
PANEL   = (23, 29, 37)
PANEL2  = (28, 35, 45)
LINE    = (44, 55, 70)
FG      = (232, 238, 244)
MUTE    = (152, 163, 177)
DIM     = (104, 115, 127)
DAY_C   = (240, 173, 60)
DAY_BG  = (42, 32, 16)
NIGHT_C = (125, 153, 247)
NIGHT_BG = (22, 30, 53)


def draw_sun(dr, cx, cy, r, color):
    dr.ellipse([cx - r * .55, cy - r * .55, cx + r * .55, cy + r * .55], outline=color, width=max(2, r // 8))
    import math
    for i in range(8):
        a = math.radians(i * 45)
        x1, y1 = cx + math.cos(a) * r * .8, cy + math.sin(a) * r * .8
        x2, y2 = cx + math.cos(a) * r * 1.15, cy + math.sin(a) * r * 1.15
        dr.line([x1, y1, x2, y2], fill=color, width=max(2, r // 8))


def draw_moon(dr, cx, cy, r, color):
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    dr.ellipse([cx - r * .45, cy - r * 1.25, cx + r * 1.55, cy + r * .75], fill=PANEL)


def build_image(view, crew, size, fonts, source):
    W, H = size
    bold_path, reg_path = fonts
    s = H / 1080.0                      # 1080p 기준 배율
    F = lambda p, sz: ImageFont.truetype(p, max(10, int(sz * s)))

    f = {
        "title":  F(bold_path, 34), "date": F(bold_path, 46), "meta": F(reg_path, 22),
        "kind":   F(bold_path, 30), "team": F(bold_path, 54), "leader": F(bold_path, 32),
        "plant":  F(reg_path, 20),  "name": F(bold_path, 27), "small": F(reg_path, 19),
    }

    pad = int(34 * s)
    pw = int(min(W * 0.46, 760 * s))
    cw = pw - pad * 2                    # 내용 폭

    def render(dr, x, y0):
        """패널 내용을 그리고 마지막 y 를 돌려준다. 높이를 재려고 두 번 호출한다."""
        y = y0
        dr.text((x, y), "4조 2교대 근무표", font=f["title"], fill=MUTE)
        y += int(46 * s)

        d = view["date"]
        dr.text((x, y), "%d.%02d.%02d (%s)" % (d.year, d.month, d.day, DOW[d.weekday()]),
                font=f["date"], fill=FG)
        dr.text((x, y + int(56 * s)),
                "%d일차  ·  휴무 %s" % (view["nth"], " · ".join(view["off"])),
                font=f["meta"], fill=MUTE)
        y += int(96 * s)
        dr.line([x, y, x + cw, y], fill=LINE, width=max(1, int(s)))
        y += int(26 * s)

        def block(y, kind, team):
            is_day = kind == "day"
            col = DAY_C if is_day else NIGHT_C
            r = int(15 * s)
            if is_day:
                draw_sun(dr, x + r, y + r, r, col)
            else:
                draw_moon(dr, x + r, y + r, int(r * .85), col)
            dr.text((x + int(44 * s), y - int(4 * s)), "주간" if is_day else "야간",
                    font=f["kind"], fill=col)
            dr.text((x + int(122 * s), y - int(16 * s)), team + "조", font=f["team"], fill=col)

            label = "08:00 – 20:00" if is_day else "20:00 – 08:00"
            tw = dr.textlength(label, font=f["small"])
            dr.text((x + cw - tw, y + int(6 * s)), label, font=f["small"], fill=DIM)
            if view["kind"] == kind:
                bw = dr.textlength("● 근무 중", font=f["small"])
                dr.text((x + cw - tw - bw - int(22 * s), y + int(6 * s)),
                        "● 근무 중", font=f["small"], fill=col)
            y += int(62 * s)

            lead = crew["crews"][team]["leader"]
            dr.text((x, y), "교대조장", font=f["plant"], fill=DIM)
            dr.text((x + int(92 * s), y - int(7 * s)), lead or "미등록",
                    font=f["leader"], fill=FG if lead else DIM)
            y += int(48 * s)

            for p in PLANTS:
                names = crew["crews"][team]["factories"][p]
                chw, chh = int(58 * s), int(30 * s)
                dr.rounded_rectangle([x, y, x + chw, y + chh], radius=int(6 * s),
                                     fill=DAY_BG if is_day else NIGHT_BG)
                lw = dr.textlength(p + "공장", font=f["plant"])
                dr.text((x + (chw - lw) / 2, y + int(4 * s)), p + "공장", font=f["plant"], fill=col)
                dr.text((x + chw + int(14 * s), y + int(1 * s)),
                        "  ".join(names) if names else "미등록",
                        font=f["name"], fill=FG if names else DIM)
                y += int(40 * s)
            return y

        y = block(y, "day", view["day"])
        if view["dawn"]:
            nd = view["night_date"]
            dr.text((x, y + int(2 * s)),
                    "야간 %s조는 어제 %d/%d 20:00 시작 · 오늘 08:00 종료"
                    % (view["night"], nd.month, nd.day), font=f["small"], fill=DIM)
            y += int(26 * s)
        y += int(18 * s)
        dr.line([x, y, x + cw, y], fill=LINE, width=max(1, int(s)))
        y += int(22 * s)
        y = block(y, "night", view["night"])

        if crew["staff"]:
            y += int(16 * s)
            dr.rounded_rectangle([x, y, x + cw, y + int(54 * s)], radius=int(8 * s), fill=PANEL2)
            dr.text((x + int(16 * s), y + int(16 * s)), "상근", font=f["plant"], fill=DIM)
            dr.text((x + int(70 * s), y + int(13 * s)), "  ".join(crew["staff"]),
                    font=f["small"], fill=MUTE)
            y += int(54 * s)

        y += int(20 * s)
        stamp = "%02d:%02d 기준 · 명단 %s" % (view["now"].hour, view["now"].minute, source)
        sw = dr.textlength(stamp, font=f["small"])
        dr.text((x + cw - sw, y), stamp, font=f["small"], fill=DIM)
        y += int(24 * s)
        return y

    # 1차: 높이만 잰다 (작은 이미지에 그려도 textlength 는 정확하다)
    measured = render(ImageDraw.Draw(Image.new("RGB", (8, 8))), 0, 0)
    ph = measured + pad * 2

    img = Image.new("RGB", (W, H), BG)
    dr = ImageDraw.Draw(img)
    px = W - pw - int(70 * s)
    py = max(int(40 * s), (H - ph) // 2)
    dr.rounded_rectangle([px, py, px + pw, py + ph], radius=int(22 * s), fill=PANEL)
    render(dr, px + pad, py + pad)       # 2차: 실제로 그린다
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


def set_wallpaper(path):
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop", 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(k, "WallpaperStyle", 0, winreg.REG_SZ, "10")   # 10 = 채우기
        winreg.SetValueEx(k, "TileWallpaper", 0, winreg.REG_SZ, "0")
        winreg.CloseKey(k)
    except Exception:
        pass
    SPI_SETDESKWALLPAPER, SPIF_UPDATEINIFILE, SPIF_SENDCHANGE = 20, 1, 2
    ok = ctypes.windll.user32.SystemParametersInfoW(
        SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
    return bool(ok)


# ───────────────────────────────── 실행 ─────────────────────────────────

def main():
    args = sys.argv[1:]

    def opt(name, default=None):
        return args[args.index(name) + 1] if name in args else default

    url = opt("--crew", CREW_URL)
    font_override = opt("--font")
    out = opt("--out")
    no_set = "--no-set" in args

    now = now_kst()
    if opt("--now"):
        import datetime as dt
        now = dt.datetime.fromisoformat(opt("--now"))

    if opt("--size"):
        w, h = opt("--size").lower().split("x")
        size = (int(w), int(h))
    else:
        size = screen_size()

    crew, source = load_crew(url)
    view = current_view(now)
    view["now"] = now

    img = build_image(view, crew, size, pick_font(font_override), source)

    if not out:
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        d = os.path.join(base, "shift-wallpaper")
        os.makedirs(d, exist_ok=True)
        # 같은 파일명으로 덮으면 윈도우가 이전 이미지를 계속 쓰는 일이 있어 번갈아 쓴다
        prev = os.path.join(d, "current.txt")
        last = ""
        try:
            last = open(prev, encoding="utf-8").read().strip()
        except OSError:
            pass
        name = "wallpaper_b.png" if last.endswith("wallpaper_a.png") else "wallpaper_a.png"
        out = os.path.join(d, name)
        try:
            open(prev, "w", encoding="utf-8").write(out)
        except OSError:
            pass

    img.save(out)
    print("이미지 저장:", out)
    print("오늘: 주간 %s조 / 야간 %s조 / 휴무 %s · 명단 %s"
          % (view["day"], view["night"], "·".join(view["off"]), source))

    if not no_set and sys.platform.startswith("win"):
        print("바탕화면 지정:", "완료" if set_wallpaper(out) else "실패")
    elif not no_set:
        print("바탕화면 지정은 Windows 에서만 동작합니다.")


if __name__ == "__main__":
    main()
