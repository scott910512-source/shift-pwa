/* ============================================================
   4조 2교대 근무표 — app.js  (바닐라 JS, 빌드 없음)

   명단은 아래 seedCrews() 가 배포 기준값이고, 사용자가 앱에서 고치면
   그 기기의 localStorage 값이 우선한다.
   ============================================================ */
(function () {
  'use strict';

  /* ==== CORE:START ==== 근무 패턴 계산 (검증 테스트가 이 블록을 그대로 실행) */

  var TEAMS = ['A', 'B', 'C', 'D'];
  var ANCHOR = Date.UTC(2026, 7, 27); // 2026-08-27 = 사이클 0일차
  var DAY = 86400000;
  var BLOCKS = [
    ['D', 'B'], // block 0 → 주간 D, 야간 B
    ['C', 'A'], // block 1 → 주간 C, 야간 A
    ['B', 'D'], // block 2 → 주간 B, 야간 D
    ['A', 'C']  // block 3 → 주간 A, 야간 C
  ];

  function mod(n, m) { return ((n % m) + m) % m; }

  function shiftOf(utcMidnight) {
    var n = Math.round((utcMidnight - ANCHOR) / DAY);
    var b = mod(Math.floor(n / 3), 4);
    var pair = BLOCKS[b];
    var day = pair[0];
    var night = pair[1];
    return {
      day: day,
      night: night,
      nth: mod(n, 3) + 1,
      off: TEAMS.filter(function (t) { return t !== day && t !== night; })
    };
  }

  /* ==== CORE:END ==== */

  /* ========== KST(UTC+9) 고정 ========== */

  var KST = 9 * 3600000;
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function kstParts(ts) {
    var d = new Date((ts === undefined ? Date.now() : ts) + KST);
    return {
      y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(),
      h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay()
    };
  }
  function keyOf(y, m, d) { return Date.UTC(y, m, d); }
  function todayKey(ts) { var p = kstParts(ts); return keyOf(p.y, p.m, p.d); }
  function partsOfKey(k) {
    var d = new Date(k);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDot(k) {
    var p = partsOfKey(k);
    return p.y + '.' + pad2(p.m + 1) + '.' + pad2(p.d) + ' (' + DOW[p.dow] + ')';
  }
  function fmtMD(k) {
    var p = partsOfKey(k);
    return (p.m + 1) + '월 ' + p.d + '일 ' + DOW[p.dow] + '요일';
  }
  function fmtMDShort(k) {
    var p = partsOfKey(k);
    return (p.m + 1) + '월 ' + p.d + '일';
  }

  /* ========== 배포 기준 데이터 ==========
     명단을 바꿔 배포할 때는 SEED_VERSION 을, 공지를 바꿀 때는
     NOTICES 만 고치고 sw.js 의 CACHE_VERSION 을 올린다. */

  var SEED_VERSION = 7;

  function seedCrews() {
    // 조직도 기준. 각 공장 안의 순서는 Board → Field 1 → Field 2 → Field 3.
    // 상근 인원과 병가 · 육아휴직자는 교대 명단에서 제외했다.
    // ※ 이름은 전원 확인 완료.
    // ※ 상근(교대 미포함): 방우석, 류인환, 우두형, 고형진, 고현석
    return {
      A: {
        leader: '노용수',
        factories: {
          '1': ['곽대력', '송상현', '문정중'],
          '2': ['하형만', '박성현', '진영욱'],
          '3': ['곽정재', '민경찬', '구태현', '여형진']
        }
      },
      B: {
        leader: '조한석',
        factories: {
          '1': ['김태진', '어하진', '황영수'],
          '2': ['안민호', '장예닮', '김재섭'],
          '3': ['김동희', '송재익', '이현식', '김동주']
        }
      },
      C: {
        leader: '김민규',
        factories: {
          '1': ['김혁순', '김병로', '임재혁'],
          '2': ['박광현', '전규석', '이재서'],
          '3': ['김인회', '김석규', '장주원', '박현석']
        }
      },
      D: {
        leader: '김명수',
        factories: {
          '1': ['정경훈', '정영훈', '이원준'],
          '2': ['백정욱', '김병섭', '박상준'],
          '3': ['양진리', '안은철', '김지용', '황성효']
        }
      }
    };
  }

  // 상근 인원 — 교대를 돌지 않으므로 A~D 조 명단과 분리해서 둔다.
  // 조 설정에서 편집하지 않고 배포 값만 쓴다.
  var STAFF = ['방우석', '류인환', '우두형', '고형진', '고현석', '김윤종'];

  // 공지사항 — 여기에 추가하고 배포하면 모든 사람에게 보인다.
  var NOTICES = [
    {
      date: '2026.08.29',
      title: '근무표 앱 사용 안내',
      body: '달력에서 날짜를 누르면 그날 근무자 명단을 볼 수 있습니다.\n' +
            '조원이 바뀌면 [조 설정] 탭에서 수정하고 저장하세요.\n' +
            '수정한 내용은 이 휴대폰에만 저장됩니다.'
    }
  ];

  var PLANTS = [
    { key: '1', label: '1공장' },
    { key: '2', label: '2공장' },
    { key: '3', label: '3공장' }
  ];

  /* ========== 저장소 ========== */

  var STORE_KEY = 'shift-pwa:data:v1';

  function defaults() {
    return {
      version: 1, seedVersion: SEED_VERSION, edited: false,
      crews: seedCrews(), settings: { theme: 'dark' }
    };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return defaults();
    var out = {
      version: 1,
      seedVersion: (typeof raw.seedVersion === 'number' && isFinite(raw.seedVersion)) ? raw.seedVersion : 0,
      edited: raw.edited === true,
      crews: {},
      settings: { theme: 'dark' }
    };
    var rc = (raw.crews && typeof raw.crews === 'object') ? raw.crews : {};
    for (var i = 0; i < TEAMS.length; i++) {
      var t = TEAMS[i];
      var src = (rc[t] && typeof rc[t] === 'object') ? rc[t] : {};
      var fSrc = (src.factories && typeof src.factories === 'object') ? src.factories : {};
      var factories = {};
      for (var j = 0; j < PLANTS.length; j++) {
        var pk = PLANTS[j].key, arr = fSrc[pk], clean = [];
        if (Object.prototype.toString.call(arr) === '[object Array]') {
          for (var k = 0; k < arr.length; k++) {
            var nm = String(arr[k] == null ? '' : arr[k]).trim();
            if (nm) clean.push(nm);
          }
        }
        factories[pk] = clean;
      }
      out.crews[t] = { leader: String(src.leader == null ? '' : src.leader).trim(), factories: factories };
    }
    var th = raw.settings && raw.settings.theme;
    out.settings.theme = (th === 'light' || th === 'auto') ? th : 'dark';
    return out;
  }

  var DATA = defaults();
  var seedUpdateAvailable = false;
  var draft = null;

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) { DATA = defaults(); saveStore(); return; }
      DATA = normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('저장된 데이터를 읽지 못해 기본값을 사용합니다:', e);
      DATA = defaults();
    }
    applySeedIfNeeded();
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(DATA)); return true; }
    catch (e) { console.warn('저장 실패:', e); return false; }
  }
  function applySeedIfNeeded() {
    seedUpdateAvailable = false;
    if (DATA.seedVersion === SEED_VERSION) return;
    if (!DATA.edited) {
      DATA.crews = seedCrews();
      DATA.seedVersion = SEED_VERSION;
      saveStore();
      console.log('[근무표] 기본 명단 v' + SEED_VERSION + ' 을 반영했습니다.');
    } else {
      seedUpdateAvailable = true;
    }
  }
  function adoptSeed() {
    DATA.crews = seedCrews();
    DATA.seedVersion = SEED_VERSION;
    DATA.edited = false;
    draft = deepCopyCrews();
    saveStore();
    seedUpdateAvailable = false;
    homeSig = '';
  }
  function leaderOf(t) { return (DATA.crews[t] && DATA.crews[t].leader) || ''; }
  function membersOf(t, pk) {
    var c = DATA.crews[t];
    return (c && c.factories && c.factories[pk]) || [];
  }
  function countOf(t) {
    return PLANTS.reduce(function (n, p) { return n + membersOf(t, p.key).length; }, 0);
  }
  function deepCopyCrews() { return normalize({ crews: DATA.crews }).crews; }

  /* ========== DOM 유틸 ========== */

  var NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    menu: ['M4 7h16M4 12h16M4 17h16'],
    bell: ['M18 8.6a6 6 0 1 0-12 0c0 6.3-2.4 7.6-2.4 7.6h16.8S18 14.9 18 8.6',
           'M13.7 20a2 2 0 0 1-3.4 0'],
    cal: ['M4.2 6.4h15.6v14.2H4.2z', 'M4.2 10.7h15.6', 'M8.4 3.4v3.6M15.6 3.4v3.6'],
    users: ['M9.2 11.5a3.4 3.4 0 1 0 0-6.9 3.4 3.4 0 0 0 0 6.9',
            'M2.9 20.3c0-3.4 2.8-5.7 6.3-5.7s6.3 2.3 6.3 5.7',
            'M16.3 5.3a3 3 0 0 1 0 5.9', 'M17.6 15c2.2.5 3.5 2.1 3.5 4.2'],
    gear: ['M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2',
           'M19.5 14.4a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z'],
    sliders: ['M4 7h9M17 7h3M4 17h3M11 17h9', 'M15 4.7v4.6M9 14.7v4.6'],
    sun: ['M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8',
          'M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4',
          'M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7'],
    moon: ['M20.4 14.6A8.6 8.6 0 0 1 9.3 3.5a8.6 8.6 0 1 0 11.1 11.1z'],
    trash: ['M4.6 6.6h14.8', 'M9.4 6.6V4.7h5.2v1.9', 'M6.7 6.6l.8 12.7h9l.8-12.7',
            'M10.2 10.2v6.2M13.8 10.2v6.2'],
    left: ['M15 5l-7 7 7 7'],
    right: ['M9 5l7 7-7 7']
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    (ICONS[name] || []).forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }
  function $(id) { return document.getElementById(id); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function setIcon(btn, name) { clear(btn); btn.appendChild(icon(name)); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.hidden = true; }, 200);
    }, 1800);
  }

  /* ========== 현재 교대 판정 ==========
     08:00~20:00 주간 / 20:00~24:00 야간 / 00:00~08:00 어제 야간 */
  function currentShift(ts) {
    var p = kstParts(ts);
    var tKey = keyOf(p.y, p.m, p.d);
    var dawn = p.h < 8;
    var kind = (p.h >= 8 && p.h < 20) ? 'day' : 'night';
    var srcKey = (kind === 'night' && dawn) ? tKey - DAY : tKey;
    var s = shiftOf(srcKey);
    return {
      kind: kind, dawn: dawn, todayKey: tKey, srcKey: srcKey,
      team: kind === 'day' ? s.day : s.night
    };
  }

  /* ========== 근무 카드 ========== */

  function namesEl(list) {
    var v = el('span', 'v sel');
    if (!list.length) { v.className = 'v none'; v.textContent = '미등록'; return v; }
    list.forEach(function (nm, i) {
      if (i) v.appendChild(el('span', 'sp', ' · '));
      v.appendChild(el('span', null, nm));
    });
    return v;
  }

  // 공장 3열 (1공장 · 2공장 · 3공장 가로 배치)
  function buildPlantCols(team) {
    var wrap = el('div', 'wb-plants');
    PLANTS.forEach(function (p) {
      var list = membersOf(team, p.key);
      var col = el('div', 'pcol');
      var t = el('div', 'pt');
      t.appendChild(el('span', null, p.label));
      t.appendChild(el('span', 'cnt', list.length ? list.length + '명' : '0명'));
      col.appendChild(t);
      var ul = el('ul', 'pnames' + (list.length ? ' sel' : ' none'));
      if (list.length) list.forEach(function (n) { ul.appendChild(el('li', null, n)); });
      else ul.appendChild(el('li', null, '미등록'));
      col.appendChild(ul);
      wrap.appendChild(col);
    });
    return wrap;
  }

  // 주간/야간 근무 블록 — 가로 풀 너비
  function buildShiftBlock(kind, team, nth, opt) {
    opt = opt || {};
    var isDay = kind === 'day';
    var bl = el('section', 'wblock ' + (isDay ? 'day' : 'night'));

    var hd = el('div', 'wb-hd');
    var orb = el('span', 'orb');
    orb.appendChild(icon(isDay ? 'sun' : 'moon'));
    hd.appendChild(orb);
    var ttl = el('div', 'wb-ttl');
    ttl.appendChild(el('span', 'wb-kind', isDay ? '주간근무' : '야간근무'));
    ttl.appendChild(el('span', 'wb-team', team + '조'));
    hd.appendChild(ttl);
    if (opt.now) hd.appendChild(el('span', 'bdg live', '근무 중'));
    bl.appendChild(hd);

    var sub = el('div', 'wb-sub');
    sub.appendChild(el('span', 'wb-time', isDay ? '08:00 – 20:00' : '20:00 – 08:00'));
    sub.appendChild(el('span', null, nth + '일차'));
    if (nth === 3) sub.appendChild(el('span', 'bdg last', '막날'));
    if (opt.startNote) sub.appendChild(el('span', 'bdg soon', opt.startNote));
    bl.appendChild(sub);

    if (opt.note) bl.appendChild(el('div', 'wb-note', opt.note));

    var lead = el('div', 'wb-lead');
    lead.appendChild(el('span', 'k', '교대조장'));
    var ln = leaderOf(team);
    lead.appendChild(ln ? el('span', 'v sel', ln) : el('span', 'v none', '미등록'));
    bl.appendChild(lead);

    bl.appendChild(buildPlantCols(team));
    return bl;
  }

  /* ========== 홈 ========== */

  var homeSig = '';

  function renderHome(force) {
    var now = Date.now();
    var cur = currentShift(now);
    var tKey = cur.todayKey;
    var dayS = shiftOf(tKey);
    var nightKey = cur.dawn ? tKey - DAY : tKey;
    var nightS = shiftOf(nightKey);

    // 현재 교대 표시
    var nowBox = $('ibNow');
    clear(nowBox);
    nowBox.className = 'ib-now ' + cur.kind;
    nowBox.appendChild(el('span', 't', cur.team));
    nowBox.appendChild(el('span', null, cur.kind === 'day' ? '주간' : '야간'));

    var sig = [tKey, nightKey, cur.kind, JSON.stringify(DATA.crews)].join('|');
    if (!force && sig === homeSig) return;
    homeSig = sig;

    var box = $('homeCards');
    clear(box);
    box.appendChild(buildShiftBlock('day', dayS.day, dayS.nth, {
      now: cur.kind === 'day',
      startNote: cur.kind === 'day' ? '' : '08:00 시작'
    }));
    box.appendChild(buildShiftBlock('night', nightS.night, nightS.nth, {
      now: cur.kind === 'night',
      startNote: cur.kind === 'night' ? '' : '20:00 시작',
      note: cur.dawn ? ('어제 ' + fmtMDShort(nightKey) + ' 20:00 시작 · 오늘 08:00 종료') : ''
    }));

    var offs = TEAMS.filter(function (t) { return t !== dayS.day && t !== nightS.night; });
    var ob = $('homeOff');
    clear(ob);
    ob.appendChild(el('span', 'k', '휴무 조'));
    offs.forEach(function (t) { ob.appendChild(el('span', 'ot', t)); });
    ob.appendChild(el('span', 'c', offs.length + '개 조'));
  }

  /* ========== 달력 ========== */

  var calMode = 'two';      // 'two' = 2주, 'month' = 한 달
  var viewY, viewM;         // month 모드
  var weekStart;            // two 모드: 표시 시작(일요일) 키

  function sundayOf(key) { return key - partsOfKey(key).dow * DAY; }

  function calMove(dir) {
    if (calMode === 'two') { weekStart += dir * 7 * DAY; }
    else {
      viewM += dir;
      if (viewM < 0) { viewM = 11; viewY--; }
      if (viewM > 11) { viewM = 0; viewY++; }
    }
    renderCalendar();
  }
  function calToToday() {
    var p = partsOfKey(todayKey());
    viewY = p.y; viewM = p.m;
    weekStart = sundayOf(todayKey());
    renderCalendar();
  }

  function renderCalendar() {
    var tKey = todayKey();
    var grid = $('calGrid');
    clear(grid);

    var cells = [];
    if (calMode === 'two') {
      for (var i = 0; i < 14; i++) cells.push({ key: weekStart + i * DAY, on: true });
      $('calTitle').textContent = fmtMDShort(weekStart) + ' – ' + fmtMDShort(weekStart + 13 * DAY);
    } else {
      var lead = new Date(Date.UTC(viewY, viewM, 1)).getUTCDay();
      var days = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate();
      var total = Math.ceil((lead + days) / 7) * 7;
      for (var c = 0; c < total; c++) {
        var dn = c - lead + 1;
        cells.push({ key: Date.UTC(viewY, viewM, dn), on: dn >= 1 && dn <= days });
      }
      $('calTitle').textContent = viewY + '년 ' + (viewM + 1) + '월';
    }

    cells.forEach(function (c, i) {
      if (!c.on) {
        var v = el('div', 'cd void');
        v.setAttribute('aria-hidden', 'true');
        grid.appendChild(v);
        return;
      }
      var p = partsOfKey(c.key);
      var s = shiftOf(c.key);
      // 3일 블록 단위로 배경을 번갈아 칠해 묶음이 눈에 보이게 한다.
      // 블록이 줄바꿈을 넘어가도 구분되도록 첫날에는 세로 표시를 넣는다.
      var blk = mod(Math.floor(Math.round((c.key - ANCHOR) / DAY) / 3), 2);
      var b = el('button', 'cd d' + mod(i, 7) +
        (blk ? ' blk' : '') + (s.nth === 1 ? ' bstart' : '') +
        (c.key === tKey ? ' today' : ''));
      b.type = 'button';
      b.dataset.key = String(c.key);
      b.setAttribute('aria-label',
        (p.m + 1) + '월 ' + p.d + '일, 주간 ' + s.day + '조, 야간 ' + s.night + '조');
      b.appendChild(el('span', 'n', String(p.d)));

      var cd = el('span', 'chip d');
      cd.appendChild(el('span', 'l', '주 '));
      cd.appendChild(el('b', null, s.day));
      b.appendChild(cd);

      var cn = el('span', 'chip n');
      cn.appendChild(el('span', 'l', '야 '));
      cn.appendChild(el('b', null, s.night));
      b.appendChild(cn);

      grid.appendChild(b);
    });
  }

  /* ========== 바텀 시트 ========== */

  var sheetKey = null, sheetOpen = false;

  function buildSheetBlock(kind, team) {
    var isDay = kind === 'day';
    var bl = el('section', 'wblock ' + (isDay ? 'day' : 'night'));

    var hd = el('div', 'wb-hd');
    var orb = el('span', 'orb');
    orb.appendChild(icon(isDay ? 'sun' : 'moon'));
    hd.appendChild(orb);
    var ttl = el('div', 'wb-ttl');
    ttl.appendChild(el('span', 'wb-kind', isDay ? '주간근무' : '야간근무'));
    ttl.appendChild(el('span', 'wb-team', team + '조'));
    hd.appendChild(ttl);
    hd.appendChild(el('span', 'wb-time', isDay ? '08:00–20:00' : '20:00–08:00'));
    bl.appendChild(hd);

    var lead = el('div', 'wb-lead');
    lead.appendChild(el('span', 'k', '교대조장'));
    var ln = leaderOf(team);
    lead.appendChild(ln ? el('span', 'v sel', ln) : el('span', 'v none', '미등록'));
    bl.appendChild(lead);

    bl.appendChild(buildPlantCols(team));
    return bl;
  }

  function renderSheet() {
    var s = shiftOf(sheetKey);
    $('sheetTitle').textContent = fmtMD(sheetKey);
    var body = $('sheetBody');
    clear(body);
    var wrap = el('div', 'wblocks');
    wrap.appendChild(buildSheetBlock('day', s.day));
    wrap.appendChild(buildSheetBlock('night', s.night));
    body.appendChild(wrap);
    var off = el('div', 'offbar');
    off.appendChild(el('span', 'k', '휴무 조'));
    s.off.forEach(function (t) { off.appendChild(el('span', 'ot', t)); });
    body.appendChild(off);
  }
  function openSheet(key) {
    sheetKey = key; renderSheet();
    $('backdrop').hidden = false; $('sheet').hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        $('backdrop').classList.add('show');
        $('sheet').classList.add('open');
      });
    });
    sheetOpen = true;
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    $('backdrop').classList.remove('show');
    $('sheet').classList.remove('open');
    setTimeout(function () {
      if (sheetOpen) return;
      $('sheet').hidden = true; $('backdrop').hidden = true;
    }, 190);
  }
  function moveSheet(d) {
    sheetKey += d * DAY;
    var p = partsOfKey(sheetKey);
    if (calMode === 'month' && (p.y !== viewY || p.m !== viewM)) { viewY = p.y; viewM = p.m; }
    if (calMode === 'two' && (sheetKey < weekStart || sheetKey > weekStart + 13 * DAY)) {
      weekStart = sundayOf(sheetKey);
    }
    renderCalendar();
    renderSheet();
  }

  /* ========== 교대 현황 ========== */

  var statusTeam = 'A';

  function renderStatus() {
    var tKey = todayKey();
    var cur = currentShift();
    var dayS = shiftOf(tKey);
    var nightKey = cur.dawn ? tKey - DAY : tKey;
    var nightS = shiftOf(nightKey);

    var box = $('statusToday');
    clear(box);
    var panel = el('div', 'panel');
    var hd = el('div', 'panel-hd');
    hd.appendChild(el('span', 'panel-t', fmtDot(tKey)));
    hd.appendChild(el('span', 'panel-c', dayS.nth + '일차 / 3일'));
    panel.appendChild(hd);

    TEAMS.forEach(function (t) {
      var role = (t === dayS.day) ? 'day' : (t === nightS.night ? 'night' : 'off');
      var r = el('div', 'trow ' + role);
      r.appendChild(el('span', 'tt', t));
      var ln = leaderOf(t);
      r.appendChild(el('span', 'tn', (ln ? ln + ' · ' : '') + '조원 ' + countOf(t) + '명'));
      r.appendChild(el('span', 'tb', role === 'day' ? '주간' : role === 'night' ? '야간' : '휴무'));
      panel.appendChild(r);
    });
    box.appendChild(panel);

    var seg = $('statusSeg');
    clear(seg);
    TEAMS.forEach(function (t) {
      var b = el('button', 'segb', t + '조');
      b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', t === statusTeam ? 'true' : 'false');
      b.addEventListener('click', function () { statusTeam = t; renderStatus(); });
      seg.appendChild(b);
    });

    var body = $('statusBody');
    clear(body);

    var lp = el('div', 'panel');
    var lh = el('div', 'panel-hd');
    lh.appendChild(el('span', 'panel-t', statusTeam + '조 교대조장'));
    lh.appendChild(el('span', 'panel-c', '조원 ' + countOf(statusTeam) + '명'));
    lp.appendChild(lh);
    var lb = el('div', 'panel-b');
    var ln2 = leaderOf(statusTeam);
    var lv = el('div', null, ln2 || '미등록');
    lv.style.fontSize = '17px';
    lv.style.fontWeight = '700';
    if (ln2) lv.className = 'sel'; else lv.style.color = 'var(--fg-3)';
    lb.appendChild(lv);
    lp.appendChild(lb);
    body.appendChild(lp);

    PLANTS.forEach(function (p) {
      var list = membersOf(statusTeam, p.key);
      var pan = el('div', 'panel');
      var ph = el('div', 'panel-hd');
      ph.appendChild(el('span', 'panel-t', p.label));
      ph.appendChild(el('span', 'panel-c', list.length ? list.length + '명' : '미등록'));
      pan.appendChild(ph);
      var pb = el('div', 'panel-b');
      var ul = el('ul', 'names' + (list.length ? ' sel' : ' none'));
      if (list.length) list.forEach(function (n) { ul.appendChild(el('li', null, n)); });
      else ul.appendChild(el('li', null, '등록된 조원이 없습니다'));
      pb.appendChild(ul);
      pan.appendChild(pb);
      body.appendChild(pan);
    });

    if (STAFF.length) {
      var sp = el('div', 'panel');
      var sh = el('div', 'panel-hd');
      sh.appendChild(el('span', 'panel-t', '상근'));
      sh.appendChild(el('span', 'panel-c', '교대 없음 · ' + STAFF.length + '명'));
      sp.appendChild(sh);
      var sb = el('div', 'panel-b');
      var sul = el('ul', 'names sel');
      STAFF.forEach(function (n) { sul.appendChild(el('li', null, n)); });
      sb.appendChild(sul);
      sp.appendChild(sb);
      body.appendChild(sp);
    }

    var goEdit = el('button', 'btn wide', '조 설정에서 편집');
    goEdit.type = 'button';
    goEdit.addEventListener('click', function () { editTeam = statusTeam; go('crewset'); });
    body.appendChild(goEdit);
  }

  /* ========== 조 설정 ========== */

  var editTeam = 'A';

  function ensureDraft() { if (!draft) draft = deepCopyCrews(); }

  function renderCrewSet() {
    ensureDraft();
    var body = $('crewSetBody');
    clear(body);

    if (seedUpdateAvailable) {
      var nb = el('div', 'notice');
      nb.appendChild(el('div', 'notice-t', '새 기본 명단이 배포되었습니다'));
      nb.appendChild(el('div', 'notice-b',
        '이 휴대폰의 명단은 직접 수정한 상태라 자동으로 바뀌지 않았습니다. ' +
        '아래를 누르면 배포된 명단으로 맞춥니다. (직접 수정한 내용은 사라집니다)'));
      var nba = el('button', 'btn pri wide', '배포된 기본 명단 적용');
      nba.type = 'button';
      nba.addEventListener('click', function () {
        if (!window.confirm('직접 수정한 명단을 버리고 배포된 명단으로 맞춥니다. 계속할까요?')) return;
        adoptSeed(); renderAll(); toast('기본 명단을 적용했습니다');
      });
      nb.appendChild(nba);
      body.appendChild(nb);
    }

    var seg = el('div', 'seg');
    TEAMS.forEach(function (t) {
      var b = el('button', 'segb', t + '조');
      b.type = 'button';
      b.setAttribute('aria-selected', t === editTeam ? 'true' : 'false');
      b.addEventListener('click', function () { editTeam = t; renderCrewSet(); });
      seg.appendChild(b);
    });
    body.appendChild(seg);

    var d = draft[editTeam];

    var lp = el('div', 'panel');
    var lh = el('div', 'panel-hd');
    lh.appendChild(el('span', 'panel-t', '교대조장'));
    lh.appendChild(el('span', 'panel-c', editTeam + '조 · 1명'));
    lp.appendChild(lh);
    var lb = el('div', 'panel-b');
    var li = el('input', 'inp');
    li.type = 'text'; li.value = d.leader; li.placeholder = '이름';
    li.setAttribute('aria-label', editTeam + '조 교대조장 이름');
    li.addEventListener('input', function () { d.leader = li.value; });
    lb.appendChild(li);
    lb.appendChild(el('p', 'note',
      '교대조장은 조당 1명입니다. 그날 주간인 조의 조장이 주간 교대조장으로, 야간인 조의 조장이 야간 교대조장으로 표시됩니다.'));
    lp.appendChild(lb);
    body.appendChild(lp);

    PLANTS.forEach(function (p) {
      var pan = el('div', 'panel');
      var ph = el('div', 'panel-hd');
      ph.appendChild(el('span', 'panel-t', p.label));
      var cnt = el('span', 'panel-c', d.factories[p.key].length + '명');
      ph.appendChild(cnt);
      pan.appendChild(ph);

      var pb = el('div', 'panel-b');
      var rows = el('div');
      pb.appendChild(rows);

      function paint() {
        clear(rows);
        var arr = d.factories[p.key];
        cnt.textContent = arr.length + '명';
        if (!arr.length) rows.appendChild(el('p', 'note', '등록된 조원이 없습니다. 아래 버튼으로 추가하세요.'));
        arr.forEach(function (nm, idx) {
          var r = el('div', 'mrow');
          r.appendChild(el('span', 'idx', String(idx + 1)));
          var inp = el('input', 'inp');
          inp.type = 'text'; inp.value = nm; inp.placeholder = '이름';
          inp.setAttribute('aria-label', p.label + ' ' + (idx + 1) + '번 조원 이름');
          inp.addEventListener('input', function () { arr[idx] = inp.value; });
          r.appendChild(inp);
          var del = el('button', 'delb');
          del.type = 'button';
          del.setAttribute('aria-label', p.label + ' ' + (idx + 1) + '번 조원 삭제');
          del.appendChild(icon('trash'));
          del.addEventListener('click', function () { arr.splice(idx, 1); paint(); });
          r.appendChild(del);
          rows.appendChild(r);
        });
      }
      paint();

      var add = el('button', 'btn add', '+ 조원 추가');
      add.type = 'button';
      add.addEventListener('click', function () {
        d.factories[p.key].push('');
        paint();
        var ins = rows.querySelectorAll('input');
        if (ins.length) ins[ins.length - 1].focus();
      });
      pb.appendChild(add);
      pan.appendChild(pb);
      body.appendChild(pan);
    });

    var bar = el('div', 'savebar');
    var save = el('button', 'btn pri wide', '저장');
    save.type = 'button';
    save.addEventListener('click', function () {
      DATA.crews = normalize({ crews: draft }).crews;
      DATA.edited = true;
      DATA.seedVersion = SEED_VERSION;
      seedUpdateAvailable = false;
      draft = deepCopyCrews();
      if (saveStore()) { homeSig = ''; renderCrewSet(); renderHome(true); toast('저장했습니다'); }
      else toast('저장에 실패했습니다');
    });
    bar.appendChild(save);
    body.appendChild(bar);
    body.appendChild(el('p', 'note',
      '이름을 비워두고 저장하면 그 칸은 자동으로 삭제됩니다. 수정한 내용은 이 휴대폰에만 저장됩니다.'));
  }

  /* ========== 공지사항 ========== */

  function renderNotice() {
    var body = $('noticeBody');
    clear(body);
    if (!NOTICES.length) {
      body.appendChild(el('div', 'empty-box', '등록된 공지가 없습니다.'));
      return;
    }
    NOTICES.forEach(function (n) {
      var pan = el('div', 'panel');
      var hd = el('div', 'panel-hd');
      var l = el('span', 'nt-hd');
      l.appendChild(el('span', 'panel-t', n.title));
      hd.appendChild(l);
      hd.appendChild(el('span', 'nt-d', n.date));
      pan.appendChild(hd);
      var b = el('div', 'panel-b');
      b.appendChild(el('div', 'nt-b sel', n.body));
      pan.appendChild(b);
      body.appendChild(pan);
    });
  }

  /* ========== 설정 ========== */

  var SET_TABS = [
    { key: 'pattern', label: '근무 패턴' },
    { key: 'app', label: '앱 설정' },
    { key: 'backup', label: '백업/복원' }
  ];
  var setTab = 'pattern';

  function renderSettings() {
    var seg = $('setSeg');
    clear(seg);
    SET_TABS.forEach(function (t) {
      var b = el('button', 'segb', t.label);
      b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', t.key === setTab ? 'true' : 'false');
      b.addEventListener('click', function () { setTab = t.key; renderSettings(); });
      seg.appendChild(b);
    });
    var body = $('setBody');
    clear(body);
    if (setTab === 'pattern') body.appendChild(buildPattern());
    else if (setTab === 'app') body.appendChild(buildApp());
    else body.appendChild(buildBackup());
  }

  function kvPanel(title, cap, rows) {
    var pan = el('div', 'panel');
    var hd = el('div', 'panel-hd');
    hd.appendChild(el('span', 'panel-t', title));
    if (cap) hd.appendChild(el('span', 'panel-c', cap));
    pan.appendChild(hd);
    var b = el('div', 'panel-b');
    rows.forEach(function (kv) {
      var r = el('div', 'kv');
      r.appendChild(el('span', 'k', kv[0]));
      r.appendChild(el('span', 'v', kv[1]));
      b.appendChild(r);
    });
    pan.appendChild(b);
    return pan;
  }

  function buildPattern() {
    var f = document.createDocumentFragment();
    var tKey = todayKey(), s = shiftOf(tKey);
    f.appendChild(kvPanel('패턴', '12일 주기', [
      ['교대 방식', '4조 2교대'],
      ['근무 주기', '주 3일 → 휴무 3일 → 야 3일 → 휴무 3일'],
      ['주간', '08:00 – 20:00'],
      ['야간', '20:00 – 08:00 (익일)'],
      ['기준 시간대', '한국 표준시(KST)']
    ]));
    f.appendChild(kvPanel('오늘', fmtDot(tKey), [
      ['주간', s.day + '조'], ['야간', s.night + '조'],
      ['휴무', s.off.join('조 · ') + '조'], ['블록 진행', s.nth + '일차 / 3일']
    ]));
    var chk = el('button', 'btn wide', '근무 패턴 검증 실행');
    chk.type = 'button';
    chk.addEventListener('click', function () {
      var r = runSelfTest();
      toast('검증 ' + r.pass + '/' + r.total + (r.ok ? ' 통과' : ' 실패'));
    });
    f.appendChild(chk);
    f.appendChild(el('p', 'note', '근무 패턴은 코드에 고정되어 있어 임의로 바뀌지 않습니다.'));
    return f;
  }

  function buildApp() {
    var f = document.createDocumentFragment();
    var pan = el('div', 'panel');
    var hd = el('div', 'panel-hd');
    hd.appendChild(el('span', 'panel-t', '화면 테마'));
    pan.appendChild(hd);
    var b = el('div', 'panel-b');
    var seg = el('div', 'seg');
    seg.style.marginBottom = '0';
    [['dark', '다크'], ['light', '라이트'], ['auto', '기기 설정']].forEach(function (o) {
      var bt = el('button', 'segb', o[1]);
      bt.type = 'button';
      bt.setAttribute('aria-selected', DATA.settings.theme === o[0] ? 'true' : 'false');
      bt.addEventListener('click', function () {
        DATA.settings.theme = o[0]; saveStore(); applyTheme(); renderSettings();
      });
      seg.appendChild(bt);
    });
    b.appendChild(seg);
    pan.appendChild(b);
    f.appendChild(pan);

    f.appendChild(kvPanel('앱 정보', null, [
      ['기본 명단 버전', 'v' + SEED_VERSION],
      ['현재 명단', DATA.edited ? '이 휴대폰에서 수정함' : '배포된 기본 명단'],
      ['오프라인', '지원'],
      ['데이터 저장', '이 휴대폰'],
      ['서버 전송', '없음']
    ]));
    return f;
  }

  function buildBackup() {
    var f = document.createDocumentFragment();

    var ep = el('div', 'panel');
    var eh = el('div', 'panel-hd');
    eh.appendChild(el('span', 'panel-t', '내보내기'));
    ep.appendChild(eh);
    var eb = el('div', 'panel-b');
    var ta = el('textarea', 'inp');
    ta.readOnly = true;
    ta.value = JSON.stringify({ version: 1, crews: DATA.crews }, null, 2);
    ta.setAttribute('aria-label', '백업 데이터');
    eb.appendChild(ta);
    var er = el('div', 'btn-row');
    var copy = el('button', 'btn', '텍스트 복사');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      if (!done && navigator.clipboard) {
        navigator.clipboard.writeText(ta.value).then(
          function () { toast('복사했습니다'); }, function () { toast('복사하지 못했습니다'); });
        return;
      }
      toast(done ? '복사했습니다' : '복사하지 못했습니다');
    });
    var dl = el('button', 'btn', '파일로 저장');
    dl.type = 'button';
    dl.addEventListener('click', function () {
      try {
        var blob = new Blob([ta.value], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = el('a'); a.href = url; a.download = 'shift-crew-backup.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (e) { toast('저장하지 못했습니다'); }
    });
    er.appendChild(copy); er.appendChild(dl);
    eb.appendChild(er); ep.appendChild(eb);
    f.appendChild(ep);

    var ip = el('div', 'panel');
    var ih = el('div', 'panel-hd');
    ih.appendChild(el('span', 'panel-t', '복원'));
    ip.appendChild(ih);
    var ib = el('div', 'panel-b');
    var ita = el('textarea', 'inp');
    ita.placeholder = '백업 JSON을 붙여넣으세요';
    ita.setAttribute('aria-label', '복원할 백업 데이터');
    ib.appendChild(ita);
    var file = el('input');
    file.type = 'file'; file.accept = 'application/json,.json'; file.style.display = 'none';
    file.addEventListener('change', function () {
      var fl = file.files && file.files[0];
      if (!fl) return;
      var rd = new FileReader();
      rd.onload = function () { ita.value = String(rd.result || ''); toast('파일을 읽었습니다'); };
      rd.onerror = function () { toast('파일을 읽지 못했습니다'); };
      rd.readAsText(fl); file.value = '';
    });
    ib.appendChild(file);
    var ir = el('div', 'btn-row');
    var pick = el('button', 'btn', '파일 선택');
    pick.type = 'button';
    pick.addEventListener('click', function () { file.click(); });
    var apply = el('button', 'btn pri', '복원 적용');
    apply.type = 'button';
    apply.addEventListener('click', function () {
      var txt = ita.value.trim();
      if (!txt) { toast('복원할 내용이 없습니다'); return; }
      var parsed;
      try { parsed = JSON.parse(txt); } catch (e) { toast('JSON 형식이 아닙니다'); return; }
      if (!window.confirm('현재 명단을 백업 내용으로 덮어씁니다. 계속할까요?')) return;
      DATA.crews = normalize({ crews: parsed.crews || parsed }).crews;
      DATA.edited = true; DATA.seedVersion = SEED_VERSION;
      seedUpdateAvailable = false;
      draft = deepCopyCrews();
      saveStore(); homeSig = ''; renderAll(); toast('복원했습니다');
    });
    ir.appendChild(pick); ir.appendChild(apply);
    ib.appendChild(ir); ip.appendChild(ib);
    f.appendChild(ip);

    var reset = el('button', 'btn dan wide', '기본 명단으로 되돌리기');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      if (!window.confirm('이 휴대폰에서 수정한 명단을 지우고 배포된 기본 명단으로 되돌립니다. 계속할까요?')) return;
      adoptSeed(); renderAll(); toast('기본 명단으로 되돌렸습니다');
    });
    f.appendChild(reset);
    f.appendChild(el('p', 'note',
      '명단은 이 휴대폰에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우면 사라지므로 백업을 보관해 두세요.'));
    return f;
  }

  /* ========== 탭 ========== */

  var TABS = [
    { key: 'home', label: '근무표', icon: 'cal', view: 'viewHome' },
    { key: 'status', label: '교대 현황', icon: 'users', view: 'viewStatus' },
    { key: 'crewset', label: '조 설정', icon: 'gear', view: 'viewCrewSet' },
    { key: 'notice', label: '공지사항', icon: 'bell', view: 'viewNotice' },
    { key: 'settings', label: '설정', icon: 'sliders', view: 'viewSet' }
  ];
  var tab = 'home';

  function go(key) {
    tab = key;
    TABS.forEach(function (t) { $(t.view).hidden = (t.key !== key); });
    var bs = $('tabbar').querySelectorAll('.tabb');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-selected', bs[i].dataset.key === key ? 'true' : 'false');
    }
    if (key === 'home') { renderHome(true); renderCalendar(); }
    else if (key === 'status') renderStatus();
    else if (key === 'crewset') renderCrewSet();
    else if (key === 'notice') renderNotice();
    else if (key === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  function renderAll() {
    renderHome(true);
    renderCalendar();
    if (tab === 'status') renderStatus();
    if (tab === 'crewset') renderCrewSet();
    if (tab === 'settings') renderSettings();
  }

  function applyTheme() {
    var t = DATA.settings.theme;
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');   // 기기 설정
  }

  /* ========== 시계 ========== */

  function tick() {
    var p = kstParts();
    $('ibDate').textContent = p.y + '.' + pad2(p.m + 1) + '.' + pad2(p.d) + ' (' + DOW[p.dow] + ')';
    $('ibClock').textContent = pad2(p.h) + ':' + pad2(p.mi) + ':' + pad2(p.s);
    renderHome(false);
    var tk = todayKey();
    if (tk !== tick.day) { tick.day = tk; renderCalendar(); }
  }
  tick.day = null;

  /* ========== 자체 검증 ========== */

  var TEST_CASES = [
    ['2026-08-21', 'B', 'D', 1, 'A,C'], ['2026-08-24', 'A', 'C', 1, 'B,D'],
    ['2026-08-26', 'A', 'C', 3, 'B,D'], ['2026-08-27', 'D', 'B', 1, 'A,C'],
    ['2026-08-29', 'D', 'B', 3, 'A,C'], ['2026-08-30', 'C', 'A', 1, 'B,D'],
    ['2026-09-01', 'C', 'A', 3, 'B,D'], ['2026-09-02', 'B', 'D', 1, 'A,C'],
    ['2026-09-05', 'A', 'C', 1, 'B,D'], ['2026-09-08', 'D', 'B', 1, 'A,C']
  ];

  function runSelfTest(quiet) {
    var rows = [], pass = 0;
    for (var i = 0; i < TEST_CASES.length; i++) {
      var c = TEST_CASES[i], q = c[0].split('-');
      var s = shiftOf(Date.UTC(+q[0], +q[1] - 1, +q[2]));
      var ok = s.day === c[1] && s.night === c[2] && s.nth === c[3] && s.off.join(',') === c[4];
      if (ok) pass++;
      rows.push({ '날짜': c[0], '주간': s.day, '야간': s.night,
        '일차': s.nth + '일차', '휴무': s.off.join(', '), '결과': ok ? 'PASS' : 'FAIL' });
    }
    if (!quiet && typeof console !== 'undefined') {
      console.log('%c[근무표 검증] ' + pass + '/' + TEST_CASES.length +
        (pass === TEST_CASES.length ? ' ALL PASS' : ' FAIL'),
        'font-weight:bold;color:' + (pass === TEST_CASES.length ? '#5ec08c' : '#e0685c'));
      if (console.table) console.table(rows); else console.log(rows);
    }
    return { pass: pass, total: TEST_CASES.length, ok: pass === TEST_CASES.length, rows: rows };
  }

  /* ========== 초기화 ========== */

  function init() {
    loadStore();
    applyTheme();

    setIcon($('hdMenu'), 'menu');
    setIcon($('hdBell'), 'bell');
    setIcon($('calPrev'), 'left');
    setIcon($('calNext'), 'right');
    setIcon($('sheetPrev'), 'left');
    setIcon($('sheetNext'), 'right');

    $('btnToday').insertBefore(icon('cal'), $('btnToday').firstChild);
    $('btnStatus').insertBefore(icon('users'), $('btnStatus').firstChild);
    $('calToggle').insertBefore(icon('cal'), $('calToggle').firstChild);

    var dow = document.querySelector('.dow');
    for (var i = 0; i < 7; i++) dow.appendChild(el('span', 'd' + i, DOW[i]));

    var tb = $('tabbar');
    TABS.forEach(function (t) {
      var b = el('button', 'tabb');
      b.type = 'button'; b.dataset.key = t.key; b.setAttribute('role', 'tab');
      b.appendChild(icon(t.icon));
      b.appendChild(el('span', null, t.label));
      b.addEventListener('click', function () { go(t.key); });
      tb.appendChild(b);
    });

    var p = partsOfKey(todayKey());
    viewY = p.y; viewM = p.m;
    weekStart = sundayOf(todayKey());

    tick();
    go('home');
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

    $('hdMenu').addEventListener('click', function () { go('settings'); });
    $('hdBell').addEventListener('click', function () { go('notice'); });
    $('btnToday').addEventListener('click', function () { calToToday(); toast('오늘로 이동'); });
    $('btnStatus').addEventListener('click', function () { go('status'); });
    $('calPrev').addEventListener('click', function () { calMove(-1); });
    $('calNext').addEventListener('click', function () { calMove(1); });
    $('calToggle').addEventListener('click', function () {
      calMode = (calMode === 'two') ? 'month' : 'two';
      var lab = $('calToggle').querySelector('span');
      lab.textContent = (calMode === 'two') ? '전체 달력' : '2주 보기';
      if (calMode === 'two') weekStart = sundayOf(todayKey());
      else { var q = partsOfKey(todayKey()); viewY = q.y; viewM = q.m; }
      renderCalendar();
    });

    $('calGrid').addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== this && !(t.classList && t.classList.contains('cd'))) t = t.parentNode;
      if (!t || t === this || !t.dataset || !t.dataset.key) return;
      openSheet(Number(t.dataset.key));
    });

    $('sheetClose').addEventListener('click', closeSheet);
    $('sheetPrev').addEventListener('click', function () { moveSheet(-1); });
    $('sheetNext').addEventListener('click', function () { moveSheet(1); });
    $('backdrop').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) {
      if (!sheetOpen) return;
      if (e.key === 'Escape') closeSheet();
      else if (e.key === 'ArrowLeft') moveSheet(-1);
      else if (e.key === 'ArrowRight') moveSheet(1);
    });

    runSelfTest();

    window.SHIFT = {
      shiftOf: shiftOf, runSelfTest: runSelfTest, keyOf: keyOf, currentShift: currentShift,
      data: function () { return DATA; }, go: go, openSheet: openSheet,
      seedVersion: SEED_VERSION, adoptSeed: adoptSeed, staff: STAFF
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (e) {
        console.warn('SW 등록 실패:', e);
      });
    });
  }
})();
