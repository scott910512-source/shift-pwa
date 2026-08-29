/* ============================================================
   4조 2교대 근무표 — app.js
   데이터 상수 + 계산 로직 + 렌더링 (바닐라 JS, 의존성 없음)

   ※ 명단 수정은 아래 LEADERS / CREW 두 상수만 고치면 됩니다.
   ============================================================ */
(function () {
  'use strict';

  /* ========== 1. 데이터 (여기만 고치면 앱 전체에 반영) ========== */

  // 교대조장 — 조당 1명 (아직 미등록이면 빈 문자열)
  var LEADERS = { A: '', B: '', C: '', D: '' };

  // 조별 · 공장별 조원
  var CREW = {
    A: {
      '1공장': [],
      '2공장': ['하형만', '박성현', '진영욱'],
      '3공장': []
    },
    B: {
      '1공장': [],
      '2공장': ['안민호', '장예닮', '김재섭'],
      '3공장': []
    },
    C: {
      '1공장': [],
      '2공장': ['박광현', '전규석', '김윤종', '이재서'],
      '3공장': []
    },
    D: {
      '1공장': [],
      '2공장': ['백정욱', '김병섭', '박상준'],
      '3공장': []
    }
  };

  var PLANTS = ['1공장', '2공장', '3공장'];

  /* ==== CORE:START ==== 근무 패턴 계산 (테스트가 이 블록을 그대로 실행합니다) */

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

  /* ========== 2. KST(UTC+9) 고정 시간 유틸 ========== */

  var KST = 9 * 3600000;

  // 기기 시간대와 무관하게 KST 기준 달력 값을 뽑는다.
  function kstParts(ts) {
    var d = new Date((ts === undefined ? Date.now() : ts) + KST);
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth(),
      d: d.getUTCDate(),
      h: d.getUTCHours(),
      mi: d.getUTCMinutes(),
      s: d.getUTCSeconds(),
      dow: d.getUTCDay()
    };
  }

  // KST 달력 날짜 → 키(UTC 자정 타임스탬프). shiftOf()의 입력값.
  function keyOf(y, m, d) { return Date.UTC(y, m, d); }
  function todayKey(ts) { var p = kstParts(ts); return keyOf(p.y, p.m, p.d); }

  // 키 → KST 달력 날짜 조각
  function partsOfKey(key) {
    var d = new Date(key);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
  }

  // KST 달력 시각 → 실제 시각(타임스탬프)
  function kstInstant(y, m, d, h) { return Date.UTC(y, m, d, h) - KST; }

  var DOW_KR = ['일', '월', '화', '수', '목', '금', '토'];
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* ========== 3. "지금 근무 중인 교대" 판정 ========== */
  /*
     08:00 ≤ 시각 < 20:00 → 오늘 날짜의 주간조
     20:00 ≤ 시각         → 오늘 날짜의 야간조
     00:00 ≤ 시각 < 08:00 → 어제 날짜의 야간조
  */
  function currentShift(ts) {
    var now = (ts === undefined) ? Date.now() : ts;
    var p = kstParts(now);
    var tKey = keyOf(p.y, p.m, p.d);

    var kind, srcKey, fromYesterday = false, boundary;

    if (p.h < 8) {
      kind = 'night';
      srcKey = tKey - DAY;
      fromYesterday = true;
      boundary = kstInstant(p.y, p.m, p.d, 8);          // 오늘 08:00
    } else if (p.h < 20) {
      kind = 'day';
      srcKey = tKey;
      boundary = kstInstant(p.y, p.m, p.d, 20);         // 오늘 20:00
    } else {
      kind = 'night';
      srcKey = tKey;
      boundary = kstInstant(p.y, p.m, p.d, 8) + DAY;    // 내일 08:00
    }

    var s = shiftOf(srcKey);
    return {
      kind: kind,
      srcKey: srcKey,
      todayKey: tKey,
      team: kind === 'day' ? s.day : s.night,
      nth: s.nth,
      fromYesterday: fromYesterday,
      boundary: boundary,
      remain: boundary - now
    };
  }

  /* ========== 4. 자체 검증 (콘솔 10건) ========== */

  var TEST_CASES = [
    ['2026-08-21', 'B', 'D', 1, 'A,C'],
    ['2026-08-24', 'A', 'C', 1, 'B,D'],
    ['2026-08-26', 'A', 'C', 3, 'B,D'],
    ['2026-08-27', 'D', 'B', 1, 'A,C'],
    ['2026-08-29', 'D', 'B', 3, 'A,C'],
    ['2026-08-30', 'C', 'A', 1, 'B,D'],
    ['2026-09-01', 'C', 'A', 3, 'B,D'],
    ['2026-09-02', 'B', 'D', 1, 'A,C'],
    ['2026-09-05', 'A', 'C', 1, 'B,D'],
    ['2026-09-08', 'D', 'B', 1, 'A,C']
  ];

  function runSelfTest(quiet) {
    var rows = [], pass = 0;
    for (var i = 0; i < TEST_CASES.length; i++) {
      var c = TEST_CASES[i];
      var p = c[0].split('-');
      var key = Date.UTC(+p[0], +p[1] - 1, +p[2]);
      var s = shiftOf(key);
      var ok = s.day === c[1] && s.night === c[2] && s.nth === c[3] && s.off.join(',') === c[4];
      if (ok) pass++;
      rows.push({
        '날짜': c[0],
        '주간': s.day, '기대': c[1],
        '야간': s.night, '기대 ': c[2],
        '일차': s.nth + '일차' + (s.nth === 3 ? '(막날)' : ''), '기대  ': c[3] + '일차',
        '휴무': s.off.join(', '), '기대   ': c[4].split(',').join(', '),
        '결과': ok ? 'PASS' : 'FAIL'
      });
    }
    if (!quiet && typeof console !== 'undefined') {
      console.log('%c[근무표 검증] ' + pass + '/' + TEST_CASES.length + ' ' +
        (pass === TEST_CASES.length ? 'ALL PASS ✅' : 'FAIL ❌'),
        'font-weight:bold;color:' + (pass === TEST_CASES.length ? '#1a7f37' : '#c02626'));
      if (console.table) console.table(rows); else console.log(rows);
    }
    return { pass: pass, total: TEST_CASES.length, rows: rows, ok: pass === TEST_CASES.length };
  }

  /* ========== 5. DOM 유틸 ========== */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function svgIcon(kind) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ico');
    s.setAttribute('aria-hidden', 'true');
    if (kind === 'day') {
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '4.4');
      s.appendChild(c);
      var rays = [[12,1.6,12,4.2],[12,19.8,12,22.4],[1.6,12,4.2,12],[19.8,12,22.4,12],
                  [4.6,4.6,6.5,6.5],[17.5,17.5,19.4,19.4],[19.4,4.6,17.5,6.5],[6.5,17.5,4.6,19.4]];
      for (var i = 0; i < rays.length; i++) {
        var l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', rays[i][0]); l.setAttribute('y1', rays[i][1]);
        l.setAttribute('x2', rays[i][2]); l.setAttribute('y2', rays[i][3]);
        s.appendChild(l);
      }
    } else {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z');
      s.appendChild(p);
    }
    return s;
  }

  function fmtRemain(ms) {
    if (ms < 0) ms = 0;
    var t = Math.floor(ms / 1000);
    return pad2(Math.floor(t / 3600)) + ':' + pad2(Math.floor(t / 60) % 60) + ':' + pad2(t % 60);
  }

  /* ========== 6. 근무 카드 컴포넌트 (오늘 화면 / 시트 공용) ========== */
  /*
     opts = { kind:'day'|'night', team:'A', nth:1..3,
              active:false, note:'', remain:null }
  */
  function buildCard(opts) {
    var isDay = opts.kind === 'day';
    var card = el('article', 'card ' + (isDay ? 'day' : 'night') +
      (opts.active ? ' active' : (opts.active === false && opts.dimmable ? ' dim' : '')));

    var top = el('div', 'card-top');

    var team = el('div', 'team', opts.team);
    team.setAttribute('aria-label', opts.team + '조');
    top.appendChild(team);

    var meta = el('div', 'meta');

    var kind = el('div', 'kind');
    kind.appendChild(svgIcon(opts.kind));
    kind.appendChild(el('span', null, isDay ? '주간' : '야간'));
    kind.appendChild(el('span', 'hours', isDay ? '08:00–20:00' : '20:00–08:00'));
    meta.appendChild(kind);

    var nth = el('div', 'nth');
    var b = el('b', null, opts.nth + '일차');
    nth.appendChild(b);
    if (opts.nth === 3) nth.appendChild(el('span', 'tag last', '막날'));
    if (opts.active) nth.appendChild(el('span', 'tag live', '근무 중'));
    if (opts.note) nth.appendChild(el('span', 'tag', opts.note));
    meta.appendChild(nth);

    if (opts.active && opts.remain !== null && opts.remain !== undefined) {
      var cnt = el('div', 'count');
      cnt.appendChild(el('span', null, (isDay ? '야간 교대까지 ' : '주간 교대까지 ')));
      var bb = el('b', 'cd', fmtRemain(opts.remain));
      cnt.appendChild(bb);
      meta.appendChild(cnt);
      card.dataset.boundary = String(opts.boundary);
    }

    top.appendChild(meta);
    card.appendChild(top);

    /* --- 조장 + 공장별 명단 --- */
    var roster = el('div', 'roster');

    var lLine = el('div', 'line leader');
    lLine.appendChild(el('span', 'ltag', '교대조장'));
    var lv = el('span', 'lval selectable');
    var leaderName = (LEADERS && LEADERS[opts.team]) ? String(LEADERS[opts.team]).trim() : '';
    if (leaderName) {
      lv.textContent = leaderName;
    } else {
      var blank = el('span', 'blank');
      blank.setAttribute('aria-label', '미등록');
      lv.appendChild(blank);
    }
    lLine.appendChild(lv);
    roster.appendChild(lLine);

    var crew = (CREW && CREW[opts.team]) || {};
    for (var i = 0; i < PLANTS.length; i++) {
      var plant = PLANTS[i];
      var list = crew[plant] || [];
      var line = el('div', 'line');
      line.appendChild(el('span', 'ltag', plant));
      var val = el('span', 'lval selectable');
      if (list.length) {
        for (var j = 0; j < list.length; j++) {
          if (j) val.appendChild(el('span', 'dot', ' · '));
          val.appendChild(el('span', null, list[j]));
        }
      } else {
        val.className = 'lval none';
        val.textContent = '미등록';
      }
      line.appendChild(val);
      roster.appendChild(line);
    }

    card.appendChild(roster);
    return card;
  }

  function buildOffRow(offTeams) {
    var row = el('div', 'offrow');
    row.appendChild(el('span', 'otag', '휴무'));
    var box = el('span', 'oteams');
    for (var i = 0; i < offTeams.length; i++) box.appendChild(el('span', 'ot', offTeams[i]));
    row.appendChild(box);
    row.appendChild(el('span', 'otag', String(offTeams.length) + '개 조'));
    return row;
  }

  /* ========== 7. 오늘 근무 렌더 ========== */

  var $ = function (id) { return document.getElementById(id); };
  var elTodayCards, elTodayOff, elTodayKey, elNowDate, elNowClock;
  var lastTodaySig = '';

  function renderToday(now) {
    var cur = currentShift(now);
    var tKey = cur.todayKey;
    var tp = partsOfKey(tKey);

    // 주간 카드 = 오늘 날짜의 주간조
    var todayShift = shiftOf(tKey);
    // 야간 카드 = 진행 중이면 그 야간, 아니면 오늘 야간
    var nightKey = (cur.kind === 'night') ? cur.srcKey : tKey;
    var nightShift = shiftOf(nightKey);

    var sig = [tKey, nightKey, cur.kind, cur.fromYesterday].join('|');
    if (sig === lastTodaySig) return cur;
    lastTodaySig = sig;

    elTodayKey.textContent = tp.y + '.' + pad2(tp.m + 1) + '.' + pad2(tp.d) + ' (' + DOW_KR[tp.dow] + ')';

    elTodayCards.textContent = '';
    var dayCard = buildCard({
      kind: 'day', team: todayShift.day, nth: todayShift.nth,
      active: cur.kind === 'day', dimmable: true,
      remain: cur.kind === 'day' ? cur.remain : null,
      boundary: cur.boundary,
      note: cur.kind === 'day' ? '' : (cur.fromYesterday ? '08:00 시작' : '')
    });
    var nightCard = buildCard({
      kind: 'night', team: nightShift.night, nth: nightShift.nth,
      active: cur.kind === 'night', dimmable: true,
      remain: cur.kind === 'night' ? cur.remain : null,
      boundary: cur.boundary,
      note: cur.kind === 'night' ? (cur.fromYesterday ? '어제 시작' : '') : '20:00 시작'
    });
    elTodayCards.appendChild(dayCard);
    elTodayCards.appendChild(nightCard);

    elTodayOff.textContent = '';
    var offs = TEAMS.filter(function (t) { return t !== todayShift.day && t !== nightShift.night; });
    elTodayOff.appendChild(buildOffRow(offs));

    return cur;
  }

  /* ========== 8. 달력 렌더 ========== */

  var elGrid, elCalTitle;
  var viewY, viewM; // KST 기준 표시 중인 연/월

  function renderCalendar() {
    elCalTitle.textContent = viewY + '년 ' + (viewM + 1) + '월';

    var tKey = todayKey();
    var first = new Date(Date.UTC(viewY, viewM, 1));
    var lead = first.getUTCDay();                          // 앞 여백(일요일 시작)
    var days = new Date(Date.UTC(viewY, viewM + 1, 0)).getUTCDate();
    var cells = Math.ceil((lead + days) / 7) * 7;

    var frag = document.createDocumentFragment();

    for (var i = 0; i < cells; i++) {
      var dnum = i - lead + 1;
      var inMonth = dnum >= 1 && dnum <= days;
      var key = Date.UTC(viewY, viewM, dnum);
      var s = shiftOf(key);
      var dow = mod(i, 7);

      if (!inMonth) {
        var padCell = el('div', 'cell pad');
        padCell.setAttribute('aria-hidden', 'true');
        frag.appendChild(padCell);
        continue;
      }

      var cls = 'cell';
      if (dow === 0) cls += ' sun';
      if (dow === 6) cls += ' sat';
      if (s.nth === 1) cls += ' blockstart';
      if (key === tKey) cls += ' today';

      var cell = el('button', cls);
      cell.type = 'button';
      cell.dataset.key = String(key);
      cell.setAttribute('aria-label',
        (viewM + 1) + '월 ' + dnum + '일 주간 ' + s.day + '조 야간 ' + s.night + '조');

      cell.appendChild(el('span', 'dnum', String(dnum)));

      var cd = el('span', 'chip d');
      cd.appendChild(el('span', 'cl', '주'));
      cd.appendChild(el('span', 'ct', s.day));
      cell.appendChild(cd);

      var cn = el('span', 'chip n');
      cn.appendChild(el('span', 'cl', '야'));
      cn.appendChild(el('span', 'ct', s.night));
      cell.appendChild(cn);

      frag.appendChild(cell);
    }

    elGrid.textContent = '';
    elGrid.appendChild(frag);
  }

  /* ========== 9. 바텀 시트 ========== */

  var elSheet, elBackdrop, elSheetCards, elSheetOff, elSheetTitle, elSheetSub;
  var sheetKey = null, sheetOpen = false, lastFocus = null;

  function renderSheet() {
    var p = partsOfKey(sheetKey);
    var s = shiftOf(sheetKey);

    elSheetTitle.textContent = (p.m + 1) + '월 ' + p.d + '일 (' + DOW_KR[p.dow] + ')';
    elSheetSub.textContent = p.y + ' · ' + s.nth + '일차' + (s.nth === 3 ? ' 막날' : '');

    elSheetCards.textContent = '';
    elSheetCards.appendChild(buildCard({ kind: 'day', team: s.day, nth: s.nth, active: false, remain: null }));
    elSheetCards.appendChild(buildCard({ kind: 'night', team: s.night, nth: s.nth, active: false, remain: null }));

    elSheetOff.textContent = '';
    elSheetOff.appendChild(buildOffRow(s.off));
  }

  function openSheet(key) {
    sheetKey = key;
    lastFocus = document.activeElement;
    renderSheet();
    elBackdrop.hidden = false;
    elSheet.hidden = false;
    // 다음 프레임에 트랜지션 시작
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        elBackdrop.classList.add('show');
        elSheet.classList.add('open');
      });
    });
    sheetOpen = true;
  }

  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    elBackdrop.classList.remove('show');
    elSheet.classList.remove('open');
    var done = function () {
      if (sheetOpen) return;
      elSheet.hidden = true;
      elBackdrop.hidden = true;
    };
    setTimeout(done, 190);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function moveSheet(deltaDays) {
    sheetKey += deltaDays * DAY;
    var p = partsOfKey(sheetKey);
    if (p.y !== viewY || p.m !== viewM) { viewY = p.y; viewM = p.m; renderCalendar(); }
    renderSheet();
  }

  /* ========== 10. 시계 / 틱 ========== */

  function tick() {
    var now = Date.now();
    var p = kstParts(now);

    elNowDate.textContent = (p.m + 1) + '월 ' + p.d + '일 (' + DOW_KR[p.dow] + ')';
    elNowClock.textContent = pad2(p.h) + ':' + pad2(p.mi) + ':' + pad2(p.s);

    var cur = renderToday(now); // 교대 시각(08:00/20:00)이 지나면 자동 재렌더

    // 카운트다운 갱신
    var cd = elTodayCards.querySelector('.cd');
    if (cd) cd.textContent = fmtRemain(cur.boundary - now);

    // 날짜가 바뀌면 달력의 '오늘' 강조 갱신
    var tk = cur.todayKey;
    if (tk !== tick._lastDay) {
      tick._lastDay = tk;
      if (elGrid.childElementCount) renderCalendar();
    }
  }
  tick._lastDay = null;

  /* ========== 11. 초기화 ========== */

  function init() {
    elTodayCards = $('todayCards'); elTodayOff = $('todayOff'); elTodayKey = $('todayKey');
    elNowDate = $('nowDate'); elNowClock = $('nowClock');
    elGrid = $('calGrid'); elCalTitle = $('calHead');
    elSheet = $('sheet'); elBackdrop = $('backdrop');
    elSheetCards = $('sheetCards'); elSheetOff = $('sheetOff');
    elSheetTitle = $('sheetTitle'); elSheetSub = $('sheetSub');

    var tp = partsOfKey(todayKey());
    viewY = tp.y; viewM = tp.m;

    tick();
    renderCalendar();
    setInterval(tick, 1000);

    // 백그라운드 복귀 시 즉시 갱신
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) tick();
    });

    $('prevMonth').addEventListener('click', function () {
      viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderCalendar();
    });
    $('nextMonth').addEventListener('click', function () {
      viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderCalendar();
    });
    $('goToday').addEventListener('click', function () {
      var p = partsOfKey(todayKey());
      viewY = p.y; viewM = p.m; renderCalendar();
    });

    elGrid.addEventListener('click', function (e) {
      var cell = e.target.closest ? e.target.closest('.cell') : null;
      if (!cell || cell.classList.contains('pad') || !cell.dataset.key) return;
      openSheet(Number(cell.dataset.key));
    });

    $('sheetPrev').addEventListener('click', function () { moveSheet(-1); });
    $('sheetNext').addEventListener('click', function () { moveSheet(1); });
    $('sheetClose').addEventListener('click', closeSheet);
    elBackdrop.addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) {
      if (!sheetOpen) return;
      if (e.key === 'Escape') closeSheet();
      else if (e.key === 'ArrowLeft') moveSheet(-1);
      else if (e.key === 'ArrowRight') moveSheet(1);
    });

    runSelfTest();

    // 콘솔 디버깅용
    window.SHIFT = {
      shiftOf: shiftOf, currentShift: currentShift, runSelfTest: runSelfTest,
      keyOf: keyOf, LEADERS: LEADERS, CREW: CREW
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ========== 12. 서비스워커 등록 (상대경로) ========== */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (err) {
        console.warn('SW 등록 실패:', err);
      });
    });
  }
})();
