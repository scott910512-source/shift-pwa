/* ============================================================
   4조 2교대 근무표 — app.js
   바닐라 JS, 빌드 없음, 의존성 없음.

   [데이터]  명단은 localStorage 에 저장됩니다. (설정 화면에서 편집)
             구조: { crews: { A: { leader, factories: { '1':[], '2':[], '3':[] } }, ... } }
   [계산]    근무 패턴 / KST 계산 로직은 기존과 동일합니다.
   ============================================================ */
(function () {
  'use strict';

  /* ==== CORE:START ==== 근무 패턴 계산 (검증 테스트가 이 블록을 그대로 실행합니다) */

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

  /* ========== KST(UTC+9) 고정 시간 유틸 ========== */

  var KST = 9 * 3600000;
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function kstParts(ts) {
    var d = new Date((ts === undefined ? Date.now() : ts) + KST);
    return {
      y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(),
      h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay()
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

  /* ========== 데이터 저장소 (localStorage) ========== */

  var STORE_KEY = 'shift-pwa:data:v1';

  /* ------------------------------------------------------------
     기본 명단(SEED)
     여기를 고치고 SEED_VERSION 을 1 올려서 배포하면,
     기기에서 따로 수정하지 않은 사용자에게는 자동으로 반영된다.
     기기에서 직접 수정한 사용자에게는 설정 화면에 적용 버튼이 뜬다.
     ------------------------------------------------------------ */
  var SEED_VERSION = 2;

  var PLANTS = [
    { key: '1', label: '1공장' },
    { key: '2', label: '2공장' },
    { key: '3', label: '3공장' }
  ];

  function seedCrews() {
    return {
      // 2공장은 실제 명단. 교대조장 / 1공장 / 3공장은 아직 임시값이므로 교체 필요.
      A: {
        leader: '홍길동',
        factories: {
          '1': ['김철수', '이영희', '박민수'],
          '2': ['하형만', '박성현', '진영욱'],
          '3': ['한지우', '서민경', '오도현']
        }
      },
      B: {
        leader: '임꺽정',
        factories: {
          '1': ['윤태호', '배수현', '노기석'],
          '2': ['안민호', '장예닮', '김재섭'],
          '3': ['문상혁', '신예린']
        }
      },
      C: {
        leader: '장길산',
        factories: {
          '1': ['임재훈', '조은비', '황선우', '남기훈'],
          '2': ['박광현', '전규석', '김윤종', '이재서'],
          '3': ['하윤슬', '표정민', '곽동주']
        }
      },
      D: {
        leader: '전우치',
        factories: {
          '1': ['소재원', '유하람', '권도현'],
          '2': ['백정욱', '김병섭', '박상준'],
          '3': ['채우진', '봉시현', '석다온']
        }
      }
    };
  }
  function defaults() {
    return {
      version: 1,
      seedVersion: SEED_VERSION,
      edited: false,               // 이 기기에서 명단을 직접 수정했는가
      crews: seedCrews(),
      settings: { theme: 'auto' }
    };
  }

  // 어떤 입력이 와도 안전한 형태로 정규화한다 (손상된 저장값 방어)
  function normalize(raw) {
    var base = defaults();
    if (!raw || typeof raw !== 'object') return base;

    var out = {
      version: 1,
      seedVersion: (typeof raw.seedVersion === 'number' && isFinite(raw.seedVersion))
        ? raw.seedVersion : 0,
      edited: raw.edited === true,
      crews: {},
      settings: { theme: 'auto' }
    };
    var rc = (raw.crews && typeof raw.crews === 'object') ? raw.crews : {};

    for (var i = 0; i < TEAMS.length; i++) {
      var t = TEAMS[i];
      var src = (rc[t] && typeof rc[t] === 'object') ? rc[t] : {};
      var fSrc = (src.factories && typeof src.factories === 'object') ? src.factories : {};
      var factories = {};
      for (var j = 0; j < PLANTS.length; j++) {
        var pk = PLANTS[j].key;
        var arr = fSrc[pk];
        var clean = [];
        if (Object.prototype.toString.call(arr) === '[object Array]') {
          for (var k = 0; k < arr.length; k++) {
            var nm = String(arr[k] === null || arr[k] === undefined ? '' : arr[k]).trim();
            if (nm) clean.push(nm);
          }
        }
        factories[pk] = clean;
      }
      out.crews[t] = {
        leader: String(src.leader === null || src.leader === undefined ? '' : src.leader).trim(),
        factories: factories
      };
    }

    var th = raw.settings && raw.settings.theme;
    out.settings.theme = (th === 'light' || th === 'dark') ? th : 'auto';
    return out;
  }

  var DATA = defaults();

  var seedUpdateAvailable = false;   // 새 기본 명단이 있는데 이 기기는 직접 수정한 상태

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

  // 배포된 기본 명단이 더 최신이면, 직접 수정한 적 없는 기기는 자동으로 따라간다.
  function applySeedIfNeeded() {
    seedUpdateAvailable = false;
    if (DATA.seedVersion === SEED_VERSION) return;
    if (!DATA.edited) {
      DATA.crews = seedCrews();
      DATA.seedVersion = SEED_VERSION;
      saveStore();
      console.log('[근무표] 기본 명단 v' + SEED_VERSION + ' 을 반영했습니다.');
    } else {
      seedUpdateAvailable = true;   // 덮어쓰지 않고 설정 화면에서 물어본다
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
  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(DATA));
      return true;
    } catch (e) {
      console.warn('저장 실패:', e);
      return false;
    }
  }
  function leaderOf(team) { return (DATA.crews[team] && DATA.crews[team].leader) || ''; }
  function membersOf(team, plantKey) {
    var c = DATA.crews[team];
    return (c && c.factories && c.factories[plantKey]) || [];
  }
  function deepCopyCrews() { return normalize({ crews: DATA.crews }).crews; }

  /* ========== DOM 유틸 ========== */

  var NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    sun: ['M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8',
          'M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4',
          'M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7'],
    moon: ['M20.4 14.6A8.6 8.6 0 0 1 9.3 3.5a8.6 8.6 0 1 0 11.1 11.1z'],
    home: ['M3.4 10.7 12 3.3l8.6 7.4', 'M5.6 9.5v11h12.8v-11'],
    cal: ['M4.2 6.4h15.6v14.2H4.2z', 'M4.2 10.7h15.6', 'M8.4 3.4v3.6M15.6 3.4v3.6'],
    users: ['M9.2 11.5a3.4 3.4 0 1 0 0-6.9 3.4 3.4 0 0 0 0 6.9',
            'M2.9 20.3c0-3.4 2.8-5.7 6.3-5.7s6.3 2.3 6.3 5.7',
            'M16.3 5.3a3 3 0 0 1 0 5.9', 'M17.6 15c2.2.5 3.5 2.1 3.5 4.2'],
    gear: ['M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2',
           'M19.5 14.4a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z'],
    trash: ['M4.6 6.6h14.8', 'M9.4 6.6V4.7h5.2v1.9', 'M6.7 6.6l.8 12.7h9l.8-12.7',
            'M10.2 10.2v6.2M13.8 10.2v6.2']
  };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function icon(name, cls) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    var paths = ICONS[name] || [];
    for (var i = 0; i < paths.length; i++) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', paths[i]);
      s.appendChild(p);
    }
    return s;
  }
  function $(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.hidden = true; }, 200);
    }, 1800);
  }

  /* ========== 근무 카드 (홈) ========== */

  function nameSpan(list, emptyText) {
    var v = el('span', 'wv sel');
    if (!list.length) {
      v.className = 'wv empty';
      v.textContent = emptyText || '미등록';
      return v;
    }
    for (var i = 0; i < list.length; i++) {
      if (i) v.appendChild(el('span', 'sep', ' · '));
      v.appendChild(el('span', null, list[i]));
    }
    return v;
  }

  function buildWorkCard(kind, team, opt) {
    opt = opt || {};
    var isDay = kind === 'day';
    var card = el('section', 'wcard ' + (isDay ? 'day' : 'night'));

    var hd = el('div', 'wc-hd');
    hd.appendChild(icon(isDay ? 'sun' : 'moon', 'wc-ico'));
    hd.appendChild(el('span', 'wc-kind', isDay ? '주간근무' : '야간근무'));
    hd.appendChild(el('span', 'wc-team', team + '조'));
    if (opt.now) hd.appendChild(el('span', 'wc-now', '지금'));
    hd.appendChild(el('span', 'wc-time', isDay ? '08:00–20:00' : '20:00–08:00'));
    card.appendChild(hd);

    var lr = el('div', 'wrow leader');
    lr.appendChild(el('span', 'wk', '교대조장'));
    var lname = leaderOf(team);
    if (lname) {
      lr.appendChild(el('span', 'wv sel', lname));
    } else {
      lr.appendChild(el('span', 'wv empty', '미등록'));
    }
    card.appendChild(lr);

    for (var i = 0; i < PLANTS.length; i++) {
      var row = el('div', 'wrow');
      row.appendChild(el('span', 'wk', PLANTS[i].label));
      row.appendChild(nameSpan(membersOf(team, PLANTS[i].key)));
      card.appendChild(row);
    }

    if (opt.note) card.appendChild(el('div', 'wc-note', opt.note));
    return card;
  }

  /* ========== 홈 화면 ========== */

  var homeSig = '';

  function renderHome(force) {
    var now = Date.now();
    var p = kstParts(now);
    var tKey = keyOf(p.y, p.m, p.d);
    var dawn = p.h < 8;                        // 00:00~08:00 → 야간조는 어제 시작분
    var nowKind = (p.h >= 8 && p.h < 20) ? 'day' : 'night';

    var dayS = shiftOf(tKey);
    var nightKey = dawn ? tKey - DAY : tKey;
    var nightS = shiftOf(nightKey);

    var sig = [tKey, nightKey, nowKind, JSON.stringify(DATA.crews)].join('|');
    if (!force && sig === homeSig) return;
    homeSig = sig;

    var box = $('homeCards');
    clear(box);
    box.appendChild(buildWorkCard('day', dayS.day, { now: nowKind === 'day' }));
    box.appendChild(buildWorkCard('night', nightS.night, {
      now: nowKind === 'night',
      note: dawn ? ('어제 ' + fmtMD(nightKey).replace('요일', '') + ' 20:00 시작 · 오늘 08:00 종료') : ''
    }));

    var offs = TEAMS.filter(function (t) { return t !== dayS.day && t !== nightS.night; });
    var ob = $('homeOff');
    clear(ob);
    ob.appendChild(el('span', 'ok2', '휴무조'));
    ob.appendChild(el('span', 'ov', offs.map(function (t) { return t + '조'; }).join(' · ')));
  }

  /* ========== 달력 ========== */

  var viewY, viewM;

  function buildCalendar() {
    var wrap = document.createDocumentFragment();

    var hd = el('div', 'cal-hd');
    var prev = el('button', 'icobtn');
    prev.type = 'button'; prev.setAttribute('aria-label', '이전 달');
    var pv = document.createElementNS(NS, 'svg');
    pv.setAttribute('viewBox', '0 0 24 24');
    var pp = document.createElementNS(NS, 'path'); pp.setAttribute('d', 'M15 5l-7 7 7 7');
    pv.appendChild(pp); prev.appendChild(pv);
    prev.addEventListener('click', function () {
      viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderCalendars();
    });

    var next = el('button', 'icobtn');
    next.type = 'button'; next.setAttribute('aria-label', '다음 달');
    var nv = document.createElementNS(NS, 'svg');
    nv.setAttribute('viewBox', '0 0 24 24');
    var np = document.createElementNS(NS, 'path'); np.setAttribute('d', 'M9 5l7 7-7 7');
    nv.appendChild(np); next.appendChild(nv);
    next.addEventListener('click', function () {
      viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderCalendars();
    });

    var today = el('button', 'cal-today', '오늘');
    today.type = 'button';
    today.addEventListener('click', function () {
      var q = partsOfKey(todayKey()); viewY = q.y; viewM = q.m; renderCalendars();
    });

    hd.appendChild(prev);
    hd.appendChild(el('div', 'cal-title', viewY + '년 ' + (viewM + 1) + '월'));
    hd.appendChild(next);
    hd.appendChild(today);
    wrap.appendChild(hd);

    var dow = el('div', 'dow');
    for (var i = 0; i < 7; i++) dow.appendChild(el('span', 's' + i, DOW[i]));
    wrap.appendChild(dow);

    var grid = el('div', 'cgrid');
    var tKey = todayKey();
    var lead = new Date(Date.UTC(viewY, viewM, 1)).getUTCDay();
    var days = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate();
    var cells = Math.ceil((lead + days) / 7) * 7;

    for (var c = 0; c < cells; c++) {
      var dnum = c - lead + 1;
      if (dnum < 1 || dnum > days) {
        var v = el('div', 'cday void');
        v.setAttribute('aria-hidden', 'true');
        grid.appendChild(v);
        continue;
      }
      var key = Date.UTC(viewY, viewM, dnum);
      var s = shiftOf(key);
      var cls = 'cday s' + mod(c, 7) + (key === tKey ? ' today' : '');
      var b = el('button', cls);
      b.type = 'button';
      b.dataset.key = String(key);
      b.setAttribute('aria-label',
        (viewM + 1) + '월 ' + dnum + '일, 주간 ' + s.day + '조, 야간 ' + s.night + '조');

      b.appendChild(el('span', 'cd-num', String(dnum)));

      var cd = el('span', 'cchip d');
      cd.appendChild(el('span', 'lb', '주 '));
      cd.appendChild(el('span', null, s.day));
      b.appendChild(cd);

      var cn = el('span', 'cchip n');
      cn.appendChild(el('span', 'lb', '야 '));
      cn.appendChild(el('span', null, s.night));
      b.appendChild(cn);

      grid.appendChild(b);
    }

    grid.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== grid && !(t.classList && t.classList.contains('cday'))) t = t.parentNode;
      if (!t || t === grid || !t.dataset || !t.dataset.key) return;
      openSheet(Number(t.dataset.key));
    });

    wrap.appendChild(grid);
    return wrap;
  }

  // 달력은 활성 탭 쪽에만 그린다 (숨은 뷰에 중복 렌더하지 않음)
  function renderCalendars() {
    var home = $('homeCal'), full = $('fullCal');
    clear(home); clear(full);
    (tab === 'cal' ? full : home).appendChild(buildCalendar());
  }

  /* ========== 바텀 시트 (날짜별 근무자) ========== */

  var sheetKey = null, sheetOpen = false;

  function buildSheetBlock(kind, team, s) {
    var isDay = kind === 'day';
    var wrap = el('div', 'sblock ' + (isDay ? 'day' : 'night'));

    var hd = el('div', 'sblock-hd');
    hd.appendChild(icon(isDay ? 'sun' : 'moon', 'sblock-ico'));
    hd.appendChild(el('span', 'sblock-t', (isDay ? '주간' : '야간') + ' · ' + team + '조'));
    hd.appendChild(el('span', 'sblock-time', isDay ? '08:00–20:00' : '20:00–08:00'));
    wrap.appendChild(hd);

    var lg = el('div', 'sgroup lead');
    lg.appendChild(el('div', 'sgroup-t', '교대조장'));
    var lname = leaderOf(team);
    lg.appendChild(el('div', 'sgroup-v' + (lname ? ' sel' : ' empty'), lname || '미등록'));
    wrap.appendChild(lg);

    for (var i = 0; i < PLANTS.length; i++) {
      var list = membersOf(team, PLANTS[i].key);
      var g = el('div', 'sgroup');
      g.appendChild(el('div', 'sgroup-t', PLANTS[i].label));
      g.appendChild(el('div', 'sgroup-v' + (list.length ? ' sel' : ' empty'),
        list.length ? list.join(' · ') : '미등록'));
      wrap.appendChild(g);
    }
    return wrap;
  }

  function renderSheet() {
    var s = shiftOf(sheetKey);
    $('sheetTitle').textContent = fmtMD(sheetKey);
    var body = $('sheetBody');
    clear(body);
    body.appendChild(buildSheetBlock('day', s.day, s));
    body.appendChild(buildSheetBlock('night', s.night, s));
    var off = el('div', 'offbar');
    off.appendChild(el('span', 'ok2', '휴무조'));
    off.appendChild(el('span', 'ov', s.off.map(function (t) { return t + '조'; }).join(' · ')));
    body.appendChild(off);
  }

  function openSheet(key) {
    sheetKey = key;
    renderSheet();
    $('backdrop').hidden = false;
    $('sheet').hidden = false;
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
      $('sheet').hidden = true;
      $('backdrop').hidden = true;
    }, 190);
  }
  function moveSheet(delta) {
    sheetKey += delta * DAY;
    var p = partsOfKey(sheetKey);
    if (p.y !== viewY || p.m !== viewM) { viewY = p.y; viewM = p.m; renderCalendars(); }
    renderSheet();
  }

  /* ========== 조 정보 화면 ========== */

  var crewTeam = 'A';

  function renderCrew() {
    var seg = $('crewSeg');
    clear(seg);
    TEAMS.forEach(function (t) {
      var b = el('button', 'segb', t + '조');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', t === crewTeam ? 'true' : 'false');
      b.addEventListener('click', function () { crewTeam = t; renderCrew(); });
      seg.appendChild(b);
    });

    var body = $('crewBody');
    clear(body);

    var lead = el('div', 'panel');
    var lhd = el('div', 'panel-hd');
    lhd.appendChild(el('span', 'panel-t', crewTeam + '조'));
    var total = PLANTS.reduce(function (n, p) { return n + membersOf(crewTeam, p.key).length; }, 0);
    lhd.appendChild(el('span', 'panel-c', '조원 ' + total + '명'));
    lead.appendChild(lhd);
    var lb = el('div', 'panel-b');
    var lr = el('div', 'crew-lead');
    lr.appendChild(el('span', 'wk', '교대조장'));
    var ln = leaderOf(crewTeam);
    var lv = el('span', 'lv' + (ln ? ' sel' : ''), ln || '미등록');
    if (!ln) lv.style.color = 'var(--fg-3)';
    lr.appendChild(lv);
    lb.appendChild(lr);
    lead.appendChild(lb);
    body.appendChild(lead);

    PLANTS.forEach(function (p) {
      var list = membersOf(crewTeam, p.key);
      var panel = el('div', 'panel');
      var hd = el('div', 'panel-hd');
      hd.appendChild(el('span', 'panel-t', p.label));
      hd.appendChild(el('span', 'panel-c', list.length ? list.length + '명' : '미등록'));
      panel.appendChild(hd);
      var pb = el('div', 'panel-b');
      var ul = el('ul', 'namelist' + (list.length ? ' sel' : ' empty'));
      if (list.length) {
        list.forEach(function (nm) { ul.appendChild(el('li', null, nm)); });
      } else {
        ul.appendChild(el('li', null, '등록된 조원이 없습니다'));
      }
      pb.appendChild(ul);
      panel.appendChild(pb);
      body.appendChild(panel);
    });

    var edit = el('button', 'btn btn-wide', '설정에서 조원 편집');
    edit.type = 'button';
    edit.addEventListener('click', function () {
      setTab = 'crew'; editTeam = crewTeam; go('set');
    });
    body.appendChild(edit);
  }

  /* ========== 설정 화면 ========== */

  var SET_TABS = [
    { key: 'crew', label: '근무조 구성' },
    { key: 'pattern', label: '근무 패턴' },
    { key: 'app', label: '앱 설정' },
    { key: 'backup', label: '백업/복원' }
  ];
  var setTab = 'crew';
  var editTeam = 'A';
  var draft = null;   // 저장 전 편집본

  function ensureDraft() { if (!draft) draft = deepCopyCrews(); }

  function renderSettings() {
    var seg = $('setSeg');
    clear(seg);
    SET_TABS.forEach(function (t) {
      var b = el('button', 'segb', t.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', t.key === setTab ? 'true' : 'false');
      b.addEventListener('click', function () { setTab = t.key; renderSettings(); });
      seg.appendChild(b);
    });

    var body = $('setBody');
    clear(body);
    if (setTab === 'crew') body.appendChild(buildCrewEditor());
    else if (setTab === 'pattern') body.appendChild(buildPatternPanel());
    else if (setTab === 'app') body.appendChild(buildAppPanel());
    else body.appendChild(buildBackupPanel());
  }

  /* --- 근무조 구성 편집 --- */

  function buildCrewEditor() {
    ensureDraft();
    var frag = document.createDocumentFragment();

    if (seedUpdateAvailable) {
      var nb = el('div', 'notice');
      nb.appendChild(el('div', 'notice-t', '새 기본 명단이 배포되었습니다'));
      nb.appendChild(el('div', 'notice-b',
        '이 기기의 명단은 직접 수정한 상태라 자동으로 바뀌지 않았습니다. ' +
        '아래를 누르면 배포된 명단으로 맞춥니다. (이 기기에서 수정한 내용은 사라집니다)'));
      var nba = el('button', 'btn btn-primary btn-wide', '배포된 기본 명단 적용');
      nba.type = 'button';
      nba.addEventListener('click', function () {
        if (!window.confirm('이 기기에서 수정한 명단을 버리고 배포된 명단으로 맞춥니다. 계속할까요?')) return;
        adoptSeed();
        renderAll();
        toast('기본 명단을 적용했습니다');
      });
      nb.appendChild(nba);
      frag.appendChild(nb);
    }

    var seg = el('div', 'seg');
    TEAMS.forEach(function (t) {
      var b = el('button', 'segb', t);
      b.type = 'button';
      b.setAttribute('aria-selected', t === editTeam ? 'true' : 'false');
      b.addEventListener('click', function () { editTeam = t; renderSettings(); });
      seg.appendChild(b);
    });
    frag.appendChild(seg);

    var d = draft[editTeam];

    /* 교대조장 */
    var lp = el('div', 'panel');
    var lhd = el('div', 'panel-hd');
    lhd.appendChild(el('span', 'panel-t', '교대조장'));
    lhd.appendChild(el('span', 'panel-c', editTeam + '조 · 1명'));
    lp.appendChild(lhd);
    var lb = el('div', 'panel-b');
    var lf = el('div', 'field');
    var li = el('input', 'inp');
    li.type = 'text';
    li.value = d.leader;
    li.placeholder = '이름';
    li.setAttribute('aria-label', editTeam + '조 교대조장 이름');
    li.addEventListener('input', function () { d.leader = li.value; });
    lf.appendChild(li);
    lb.appendChild(lf);
    lb.appendChild(el('p', 'note',
      '교대조장은 조당 1명입니다. 그날 주간인 조의 조장이 주간 교대조장으로, 야간인 조의 조장이 야간 교대조장으로 표시됩니다.'));
    lp.appendChild(lb);
    frag.appendChild(lp);

    /* 공장별 조원 */
    PLANTS.forEach(function (p) {
      var panel = el('div', 'panel');
      var hd = el('div', 'panel-hd');
      hd.appendChild(el('span', 'panel-t', p.label));
      var cnt = el('span', 'panel-c', d.factories[p.key].length + '명');
      hd.appendChild(cnt);
      panel.appendChild(hd);

      var pb = el('div', 'panel-b');
      var rows = el('div');
      pb.appendChild(rows);

      function paint() {
        clear(rows);
        var arr = d.factories[p.key];
        cnt.textContent = arr.length + '명';
        if (!arr.length) {
          rows.appendChild(el('p', 'note', '등록된 조원이 없습니다. 아래 버튼으로 추가하세요.'));
        }
        arr.forEach(function (nm, idx) {
          var r = el('div', 'mrow');
          r.appendChild(el('span', 'midx', String(idx + 1)));
          var inp = el('input', 'inp');
          inp.type = 'text';
          inp.value = nm;
          inp.placeholder = '이름';
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

      var add = el('button', 'btn btn-add', '+ 조원 추가');
      add.type = 'button';
      add.addEventListener('click', function () {
        d.factories[p.key].push('');
        paint();
        var inputs = rows.querySelectorAll('input');
        if (inputs.length) inputs[inputs.length - 1].focus();
      });
      pb.appendChild(add);
      panel.appendChild(pb);
      frag.appendChild(panel);
    });

    var bar = el('div', 'savebar');
    var save = el('button', 'btn btn-primary btn-wide', '저장');
    save.type = 'button';
    save.addEventListener('click', function () {
      DATA.crews = normalize({ crews: draft }).crews;   // 빈 이름 제거 + 정규화
      DATA.edited = true;                 // 이후 기본 명단이 바뀌어도 덮어쓰지 않는다
      DATA.seedVersion = SEED_VERSION;
      seedUpdateAvailable = false;
      draft = deepCopyCrews();
      if (saveStore()) {
        homeSig = '';
        renderSettings();
        renderHome(true);
        toast('저장했습니다');
      } else {
        toast('저장에 실패했습니다');
      }
    });
    bar.appendChild(save);
    frag.appendChild(bar);

    frag.appendChild(el('p', 'note',
      '이름을 비워두고 저장하면 해당 칸은 자동으로 삭제됩니다. 저장된 내용은 이 기기에 보관되며 앱을 껐다 켜도 유지됩니다.'));
    return frag;
  }

  /* --- 근무 패턴 (읽기 전용) --- */

  function buildPatternPanel() {
    var frag = document.createDocumentFragment();
    var tKey = todayKey();
    var s = shiftOf(tKey);

    var p1 = el('div', 'panel');
    var h1 = el('div', 'panel-hd');
    h1.appendChild(el('span', 'panel-t', '패턴'));
    h1.appendChild(el('span', 'panel-c', '12일 주기'));
    p1.appendChild(h1);
    var b1 = el('div', 'panel-b');
    [
      ['교대 방식', '4조 2교대'],
      ['근무 주기', '주간 3일 → 휴무 3일 → 야간 3일 → 휴무 3일'],
      ['주간 시간', '08:00 – 20:00'],
      ['야간 시간', '20:00 – 08:00 (익일)'],
      ['기준 시간대', '한국 표준시(KST) 고정']
    ].forEach(function (kv) {
      var r = el('div', 'kv');
      r.appendChild(el('span', 'k', kv[0]));
      r.appendChild(el('span', 'v', kv[1]));
      b1.appendChild(r);
    });
    p1.appendChild(b1);
    frag.appendChild(p1);

    var p2 = el('div', 'panel');
    var h2 = el('div', 'panel-hd');
    h2.appendChild(el('span', 'panel-t', '오늘'));
    h2.appendChild(el('span', 'panel-c', fmtDot(tKey)));
    p2.appendChild(h2);
    var b2 = el('div', 'panel-b');
    [
      ['주간', s.day + '조'],
      ['야간', s.night + '조'],
      ['휴무', s.off.join('조 · ') + '조'],
      ['블록 진행', s.nth + '일차 / 3일']
    ].forEach(function (kv) {
      var r = el('div', 'kv');
      r.appendChild(el('span', 'k', kv[0]));
      r.appendChild(el('span', 'v', kv[1]));
      b2.appendChild(r);
    });
    p2.appendChild(b2);
    frag.appendChild(p2);

    var chk = el('button', 'btn btn-wide', '근무 패턴 검증 실행');
    chk.type = 'button';
    chk.addEventListener('click', function () {
      var r = runSelfTest();
      toast('검증 ' + r.pass + '/' + r.total + (r.ok ? ' 통과' : ' 실패'));
    });
    frag.appendChild(chk);
    frag.appendChild(el('p', 'note',
      '근무 패턴은 코드에 고정되어 있어 임의로 바뀌지 않습니다. 검증 실행 결과는 브라우저 콘솔에도 표로 출력됩니다.'));
    return frag;
  }

  /* --- 앱 설정 --- */

  function buildAppPanel() {
    var frag = document.createDocumentFragment();
    var panel = el('div', 'panel');
    var hd = el('div', 'panel-hd');
    hd.appendChild(el('span', 'panel-t', '화면 테마'));
    panel.appendChild(hd);
    var pb = el('div', 'panel-b');

    var seg = el('div', 'seg');
    seg.style.marginBottom = '0';
    [['auto', '기기 설정'], ['light', '라이트'], ['dark', '다크']].forEach(function (o) {
      var b = el('button', 'segb', o[1]);
      b.type = 'button';
      b.setAttribute('aria-selected', DATA.settings.theme === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        DATA.settings.theme = o[0];
        saveStore();
        applyTheme();
        renderSettings();
      });
      seg.appendChild(b);
    });
    pb.appendChild(seg);
    panel.appendChild(pb);
    frag.appendChild(panel);

    var info = el('div', 'panel');
    var ih = el('div', 'panel-hd');
    ih.appendChild(el('span', 'panel-t', '앱 정보'));
    info.appendChild(ih);
    var ib = el('div', 'panel-b');
    [
      ['기본 명단 버전', 'v' + SEED_VERSION],
      ['현재 명단', DATA.edited ? '이 기기에서 수정함' : '배포된 기본 명단'],
      ['오프라인', '지원 (서비스워커 캐시)'],
      ['데이터 저장', '이 기기 (localStorage)'],
      ['서버 전송', '없음']
    ].forEach(function (kv) {
      var r = el('div', 'kv');
      r.appendChild(el('span', 'k', kv[0]));
      r.appendChild(el('span', 'v', kv[1]));
      ib.appendChild(r);
    });
    info.appendChild(ib);
    frag.appendChild(info);
    return frag;
  }

  /* --- 백업 / 복원 --- */

  function buildBackupPanel() {
    var frag = document.createDocumentFragment();

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
    var erow = el('div', 'btn-row');
    var copy = el('button', 'btn', '텍스트 복사');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      if (!done && navigator.clipboard) {
        navigator.clipboard.writeText(ta.value).then(function () { toast('복사했습니다'); },
          function () { toast('복사하지 못했습니다'); });
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
        var a = el('a');
        a.href = url;
        a.download = 'shift-crew-backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (e) { toast('저장하지 못했습니다'); }
    });
    erow.appendChild(copy); erow.appendChild(dl);
    eb.appendChild(erow);
    ep.appendChild(eb);
    frag.appendChild(ep);

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
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.style.display = 'none';
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { ita.value = String(rd.result || ''); toast('파일을 읽었습니다'); };
      rd.onerror = function () { toast('파일을 읽지 못했습니다'); };
      rd.readAsText(f);
      file.value = '';
    });
    ib.appendChild(file);

    var irow = el('div', 'btn-row');
    var pick = el('button', 'btn', '파일 선택');
    pick.type = 'button';
    pick.addEventListener('click', function () { file.click(); });
    var apply = el('button', 'btn btn-primary', '복원 적용');
    apply.type = 'button';
    apply.addEventListener('click', function () {
      var txt = ita.value.trim();
      if (!txt) { toast('복원할 내용이 없습니다'); return; }
      var parsed;
      try { parsed = JSON.parse(txt); } catch (e) { toast('JSON 형식이 아닙니다'); return; }
      if (!window.confirm('현재 명단을 백업 내용으로 덮어씁니다. 계속할까요?')) return;
      DATA.crews = normalize({ crews: parsed.crews || parsed }).crews;
      DATA.edited = true;
      DATA.seedVersion = SEED_VERSION;
      seedUpdateAvailable = false;
      draft = deepCopyCrews();
      saveStore();
      homeSig = '';
      renderAll();
      toast('복원했습니다');
    });
    irow.appendChild(pick); irow.appendChild(apply);
    ib.appendChild(irow);
    ip.appendChild(ib);
    frag.appendChild(ip);

    var reset = el('button', 'btn btn-danger btn-wide', '기본 명단으로 되돌리기');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      if (!window.confirm('이 기기에서 수정한 명단을 지우고 배포된 기본 명단으로 되돌립니다. 계속할까요?')) return;
      adoptSeed();
      renderAll();
      toast('기본 명단으로 되돌렸습니다');
    });
    frag.appendChild(reset);
    frag.appendChild(el('p', 'note',
      '명단은 이 기기에만 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우면 사라지므로 백업을 보관해 두세요.'));
    return frag;
  }

  /* ========== 화면 전환 ========== */

  var TABS = [
    { key: 'home', label: '홈', icon: 'home', view: 'viewHome' },
    { key: 'cal', label: '달력', icon: 'cal', view: 'viewCal' },
    { key: 'crew', label: '조 정보', icon: 'users', view: 'viewCrew' },
    { key: 'set', label: '설정', icon: 'gear', view: 'viewSet' }
  ];
  var tab = 'home';

  function go(key) {
    tab = key;
    TABS.forEach(function (t) { $(t.view).hidden = (t.key !== key); });
    var bs = $('tabbar').querySelectorAll('.tabb');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-selected', bs[i].dataset.key === key ? 'true' : 'false');
    }
    if (key === 'home') { renderHome(true); renderCalendars(); }
    else if (key === 'cal') renderCalendars();
    else if (key === 'crew') renderCrew();
    else if (key === 'set') renderSettings();
    window.scrollTo(0, 0);
  }

  function renderAll() {
    renderHome(true);
    renderCalendars();
    if (tab === 'crew') renderCrew();
    if (tab === 'set') renderSettings();
  }

  function applyTheme() {
    var t = DATA.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  /* ========== 시계 / 주기 갱신 ========== */

  function tick() {
    var p = kstParts();
    $('hdDate').textContent = p.y + '.' + pad2(p.m + 1) + '.' + pad2(p.d) + ' (' + DOW[p.dow] + ')';
    $('hdTime').textContent = pad2(p.h) + ':' + pad2(p.mi);
    renderHome(false);       // 08:00 / 20:00 경계를 지나면 자동으로 다시 그린다
    var tk = todayKey();
    if (tk !== tick.day) { tick.day = tk; renderCalendars(); }
  }
  tick.day = null;

  /* ========== 근무 패턴 자체 검증 ========== */

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
      rows.push({
        '날짜': c[0], '주간': s.day, '야간': s.night,
        '일차': s.nth + '일차', '휴무': s.off.join(', '), '결과': ok ? 'PASS' : 'FAIL'
      });
    }
    if (!quiet && typeof console !== 'undefined') {
      console.log('%c[근무표 검증] ' + pass + '/' + TEST_CASES.length +
        (pass === TEST_CASES.length ? ' ALL PASS' : ' FAIL'),
        'font-weight:bold;color:' + (pass === TEST_CASES.length ? '#1a7f37' : '#c02626'));
      if (console.table) console.table(rows); else console.log(rows);
    }
    return { pass: pass, total: TEST_CASES.length, ok: pass === TEST_CASES.length, rows: rows };
  }

  /* ========== 초기화 ========== */

  function init() {
    loadStore();
    applyTheme();

    var tb = $('tabbar');
    TABS.forEach(function (t) {
      var b = el('button', 'tabb');
      b.type = 'button';
      b.dataset.key = t.key;
      b.setAttribute('role', 'tab');
      b.appendChild(icon(t.icon));
      b.appendChild(el('span', null, t.label));
      b.addEventListener('click', function () { go(t.key); });
      tb.appendChild(b);
    });

    var p = partsOfKey(todayKey());
    viewY = p.y; viewM = p.m;

    tick();
    go('home');
    setInterval(tick, 10000);

    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

    $('hdSettings').addEventListener('click', function () { go('set'); });
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
      shiftOf: shiftOf, runSelfTest: runSelfTest, keyOf: keyOf,
      data: function () { return DATA; }, go: go, openSheet: openSheet,
      seedVersion: SEED_VERSION, adoptSeed: adoptSeed
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ========== 서비스워커 (상대경로) ========== */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (e) {
        console.warn('SW 등록 실패:', e);
      });
    });
  }
})();
