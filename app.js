/* 하트노트 · 부부 사랑 기록
 * 기기 안(localStorage)에만 저장하는 조용한 사랑 노트. */
(() => {
  'use strict';

  const STORE_KEY = 'heartnote.v1';
  const WHO_KEY = 'heartnote.who.v1';
  const SHARE_KEY = 'heartnote.share.v1';
  const DIRTY_KEY = 'heartnote.dirty.v1';

  // 수유 앱과 같은 Firebase Realtime Database. 부부 기록은 /couple_rooms/{방} 에 따로 저장해요.
  const DEFAULT_FIREBASE_URL = 'https://baby-feeding-9f820-default-rtdb.asia-southeast1.firebasedatabase.app';
  const ROOM_ROOT = 'couple_rooms';
  const APP_URL = 'https://bswjys.github.io/couple-love/';
  const REQ_TIMEOUT = 8000;        // 네트워크 요청 제한 시간
  const POLL_MS = 5000;            // 실시간 스트림이 막혔을 때 대신 확인하는 주기
  const STREAM_IDLE_MS = 75000;    // 이 시간 동안 아무 소식이 없으면 스트림을 다시 연다
  const TOMB_KEEP_MS = 90 * 24 * 3600 * 1000; // 오래된 삭제 표시 정리 기준

  const MOODS = ['설렘', '포근', '행복', '고마움'];
  const MOOD_EMOJI = { 설렘: '💓', 포근: '🧸', 행복: '😊', 고마움: '🙏' };
  // 통계 기준 시작일 기본값 — 이 날 이전 기록은 통계에서 빼고, 경과 일수도 이 날부터 센다.
  const DEFAULT_STATS_START = '2026-11-01';
  const WINDOWS = [
    { key: 'month', label: '월 평균', range: '최근 30일', days: 30 },
    { key: 'quarter', label: '분기 평균', range: '최근 90일', days: 90 },
    { key: 'half', label: '반기 평균', range: '최근 180일', days: 180 },
    { key: 'yearAvg', label: '연 평균', range: '최근 365일', days: 365 },
  ];

  const MISSIONS = [
    { t: '10초 포옹하기', s: '말없이 꼭, 열까지 세어 봐요' },
    { t: '오늘 고마웠던 말 한마디', s: '떠오르면 그 자리에서' },
    { t: '손 잡고 5분 걷기', s: '동네 한 바퀴면 충분해요' },
    { t: '좋아하는 간식 사다 주기', s: '오는 길에 하나' },
    { t: '처음 만난 날 이야기', s: '3분만 꺼내 봐요' },
    { t: '눈 맞추고 웃어 주기', s: '3초면 돼요' },
    { t: '오늘 하루 10분 듣기', s: '조언 없이 듣기만' },
    { t: '커피 한 잔 타 주기', s: '설탕 양까지 기억하기' },
    { t: '칭찬 한 가지 크게 말하기', s: '부끄러워도 또박또박' },
    { t: '함께 사진 한 장', s: '오늘의 우리를 남겨요' },
    { t: '어깨 5분 주물러 주기', s: '힘 조절은 센스' },
    { t: '사랑하는 이유 한 줄', s: '메모에 남겨도 좋아요' },
    { t: '좋아하는 노래 같이 듣기', s: '한 곡이면 충분해요' },
    { t: '다음 데이트 약속하기', s: '날짜까지 정하면 완벽' },
    { t: '인사는 안아서', s: '나가고 들어올 때' },
    { t: '"수고했어" 말해 주기', s: '오늘 하루도 충분히' },
    { t: '짧은 손 편지', s: '세 줄이면 마음이 닿아요' },
    { t: '함께 기도하기', s: '서로를 위해 한마디' },
    { t: '설거지 같이 하기', s: '말동무 삼아 나란히' },
    { t: '감사한 일 하나씩', s: '잠들기 전에 나누기' },
  ];

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  /* ───────── 날짜 도우미 ───────── */
  function dateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function parseKey(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function todayKey() { return dateKey(new Date()); }
  function nowTime() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function startOfDay(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function diffDays(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  }
  function fmtDate(k, opts = {}) {
    const d = parseKey(k);
    const thisYear = new Date().getFullYear();
    const yearPart = (opts.alwaysYear || d.getFullYear() !== thisYear) ? `${d.getFullYear()}년 ` : '';
    return `${yearPart}${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
  }
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h < 12 ? '오전' : '오후';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${ampm} ${h12}:${pad(m)}`;
  }
  function fmtNum(v) {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const isTimeKey = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);

  /* ───────── 저장 ───────── */
  const defaultState = () => ({
    version: 1,
    records: [],
    tomb: {},
    settings: {
      pinOn: false, pin: '', startDate: '', startUpdatedAt: 0,
      statsStartDate: DEFAULT_STATS_START, statsStartUpdatedAt: 0,
    },
    mission: { date: '', idx: 0, done: false, updatedAt: 0 },
  });

  function legacyStamp(date, time) {
    const d = parseKey(date);
    const [h, m] = time.split(':').map(Number);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  }

  function normalizeRecord(r) {
    if (!r || !isDateKey(r.date)) return null;
    const mood = MOODS.includes(r.mood) ? r.mood : '';
    const time = isTimeKey(r.time) ? r.time : '12:00';
    let updatedAt = Number(r.updatedAt);
    if (!isFinite(updatedAt) || updatedAt <= 0) updatedAt = legacyStamp(r.date, time);
    return {
      id: typeof r.id === 'string' && r.id ? r.id : 'r' + Math.random().toString(36).slice(2, 9),
      date: r.date,
      time,
      mood,
      memo: typeof r.memo === 'string' ? r.memo.slice(0, 60) : '',
      by: r.by === 'wife' || r.by === 'husband' ? r.by : null,
      updatedAt,
    };
  }

  function load() {
    const s = defaultState();
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { /* 저장소를 쓸 수 없음 */ }
    if (!raw) return s;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.records)) {
        s.records = parsed.records.map(normalizeRecord).filter(Boolean);
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        s.settings.pinOn = parsed.settings.pinOn === true;
        s.settings.pin = typeof parsed.settings.pin === 'string' && /^\d{4}$/.test(parsed.settings.pin) ? parsed.settings.pin : '';
        s.settings.startDate = isDateKey(parsed.settings.startDate) ? parsed.settings.startDate : '';
        s.settings.startUpdatedAt = Number(parsed.settings.startUpdatedAt) || 0;
        // 저장된 값이 있으면 그대로(빈 값 = 전체 기록), 없으면 기본값 2026-11-01
        if (typeof parsed.settings.statsStartDate === 'string') {
          s.settings.statsStartDate = isDateKey(parsed.settings.statsStartDate) ? parsed.settings.statsStartDate : '';
        }
        s.settings.statsStartUpdatedAt = Number(parsed.settings.statsStartUpdatedAt) || 0;
        if (!s.settings.pin) s.settings.pinOn = false;
      }
      if (parsed.mission && typeof parsed.mission === 'object') {
        s.mission = {
          date: typeof parsed.mission.date === 'string' ? parsed.mission.date : '',
          idx: Number.isInteger(parsed.mission.idx) ? parsed.mission.idx : 0,
          done: parsed.mission.done === true,
          updatedAt: Number(parsed.mission.updatedAt) || 0,
        };
      }
      if (parsed.tomb && typeof parsed.tomb === 'object') {
        Object.keys(parsed.tomb).forEach((id) => {
          const v = Number(parsed.tomb[id]);
          if (id && isFinite(v) && v > 0) s.tomb[id] = v;
        });
      }
    } catch (e) { /* 깨진 저장값은 새로 시작 */ }
    sortRecords(s.records);
    return s;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      showToast('이 브라우저에 저장하지 못했어요. 설정에서 백업을 받아 두세요.');
      return false;
    }
  }

  function sortRecords(list) {
    list.sort((a, b) => a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date));
    return list;
  }

  const state = load();
  let lastDeleted = null;
  let lastFocus = null;

  /* ═════════════ 기록자 (아내 / 남편) ═════════════ */
  let who = 'wife';
  const WHO_LABEL = { wife: '아내', husband: '남편' };
  const WHO_EMOJI = { wife: '👩', husband: '👨' };
  function byLabel(by) {
    return WHO_LABEL[by] ? `${WHO_EMOJI[by]} ${WHO_LABEL[by]}` : '';
  }

  function setWho(next, opts) {
    who = next === 'husband' ? 'husband' : 'wife';
    try { localStorage.setItem(WHO_KEY, who); } catch (e) { /* 무시 */ }
    const w = $('whoWife');
    const h = $('whoHusband');
    if (w) w.setAttribute('aria-pressed', who === 'wife' ? 'true' : 'false');
    if (h) h.setAttribute('aria-pressed', who === 'husband' ? 'true' : 'false');
    if (opts && opts.toast) showToast(who === 'wife' ? '👩 아내로 기록할게요' : '👨 남편으로 기록할게요');
  }

  /* ═════════════ 부부 공유 (Firebase RTDB REST + SSE) ═════════════
   * 수유 앱과 같은 Firebase 주소를 쓰되, 기록은 /couple_rooms/{방} 에만 저장해요.
   * PIN 잠금은 기기마다의 사생활 보호라서 서버에 올리지 않아요.
   */
  const share = { url: '', room: '', linked: false };
  const net = {
    mode: 'local',      // local | connecting | live | polling | offline | error
    es: null,
    pollTimer: null,
    watchTimer: null,
    lastEvent: 0,
    restarts: 0,
    fails: 0,
    mirror: null,       // 마지막으로 받은 방 전체 스냅숏
    dirty: new Set(),   // 아직 서버에 못 보낸 기록 id · meta 키
    flushing: false,
    announce: false,
    joined: false,
  };
  let flushTimer = null;
  const META_START = 'meta:startDate';
  const META_STATS_START = 'meta:statsStartDate';
  const META_MISSION = 'meta:mission';
  // 이번 실행에서 사용자가 직접 바꾼 항목 (방에 처음 들어갈 때 서버 값을 그대로 따를지 판단)
  const touched = { startDate: false, statsStart: false, mission: false };

  function normDb(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s.replace(/\/+$/, '');
  }
  function normRoom(u) {
    return String(u || '')
      .replace(/\s+/g, '')
      .replace(/[^0-9A-Za-z\uAC00-\uD7A3_-]/g, '')
      .replace(/[a-z]/g, (c) => c.toUpperCase())
      .slice(0, 12);
  }
  function roomValid(code) {
    return typeof code === 'string' && code.length >= 2 && code.length <= 12;
  }
  const roomReady = () => roomValid(share.room);
  const shared = () => !!(share.url && roomReady());

  function roomBase() { return `${share.url}/${ROOM_ROOT}/${encodeURIComponent(share.room)}`; }
  function recordsUrl() { return `${roomBase()}/records.json`; }
  function recordUrl(id) { return `${roomBase()}/records/${encodeURIComponent(id)}.json`; }
  function metaUrl(key) { return `${roomBase()}/${key}.json`; }
  function roomUrl() { return `${roomBase()}.json`; }
  function inviteLink() { return `${APP_URL}?room=${encodeURIComponent(share.room)}`; }

  /* ── 설정 읽기/쓰기 ── */
  function loadShare() {
    try {
      const raw = localStorage.getItem(SHARE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.url === 'string') share.url = normDb(d.url);
        if (typeof d.room === 'string') share.room = normRoom(d.room);
      }
    } catch (e) { /* 무시 */ }
    if (!share.url) share.url = normDb(DEFAULT_FIREBASE_URL);
    if (!roomReady(share.room)) share.room = '';

    // 초대 링크(?room=우리둘)로 열면 코드 입력 없이 바로 연결
    let linked = '';
    try {
      linked = normRoom(new URLSearchParams(location.search).get('room') || '');
    } catch (e) { /* 무시 */ }
    if (roomValid(linked)) {
      share.room = linked;
      share.linked = true;
      persistShare();
    }

    try {
      const w = localStorage.getItem(WHO_KEY);
      if (w === 'wife' || w === 'husband') who = w;
    } catch (e) { /* 무시 */ }

    try {
      const arr = JSON.parse(localStorage.getItem(DIRTY_KEY) || '[]');
      if (Array.isArray(arr)) arr.forEach((k) => { if (typeof k === 'string') net.dirty.add(k); });
    } catch (e) { /* 무시 */ }
  }

  function persistShare() {
    try {
      localStorage.setItem(SHARE_KEY, JSON.stringify({ url: share.url, room: share.room }));
    } catch (e) { /* 무시 */ }
  }

  function saveDirty() {
    try { localStorage.setItem(DIRTY_KEY, JSON.stringify(Array.from(net.dirty))); } catch (e) { /* 무시 */ }
  }

  /* ── 상태 표시 ── */
  function setMode(mode) {
    if (net.mode === mode) { renderShare(); return; }
    net.mode = mode;
    renderShare();
  }

  function renderShare() {
    const m = net.mode;
    const pill = $('sharePill');
    if (!pill) return;
    pill.dataset.mode = m;
    $('shareDot').className = `dot dot-${m}`;
    const status = $('shareStatus');
    if (status) {
      status.dataset.mode = m;
      $('shareStatusDot').className = `dot dot-${m}`;
    }

    let label = '부부 공유 켜기';
    if (m === 'connecting') label = '연결 중…';
    else if (m === 'live' || m === 'polling') label = '부부 공유 중';
    else if (m === 'offline') label = '오프라인 · 저장 중';
    else if (m === 'error') label = '연결 확인 필요';
    $('shareLabel').textContent = label;

    const roomShown = m !== 'local' && m !== 'error' && !!share.room;
    $('shareRoom').textContent = roomShown ? share.room : '';
    $('shareRoom').hidden = !roomShown;

    pill.setAttribute('aria-label', m === 'local'
      ? '부부 공유 켜기 · 부부 공유 설정 열기'
      : `${label}${roomShown ? ` (방: ${share.room})` : ''} · 부부 공유 설정 열기`);

    const saveBtn = $('shareSave');
    if (saveBtn) saveBtn.textContent = m === 'local' ? '부부 공유 켜기' : '연결하기';

    const n = state.records.length;
    const st = $('shareStatusText');
    if (st) {
      if (m === 'live') st.textContent = `● 부부 공유 중 (방: ${share.room})${n ? ` · 하트 ${n}개` : ''}`;
      else if (m === 'polling') st.textContent = `● 부부 공유 중 (방: ${share.room}) · 5초마다 확인${n ? ` · 하트 ${n}개` : ''}`;
      else if (m === 'connecting') st.textContent = `연결 중… (방: ${share.room})`;
      else if (m === 'offline') st.textContent = `오프라인 · 이 기기에 먼저 저장하고 있어요${share.room ? ` (방: ${share.room})` : ''}`;
      else if (m === 'error') st.textContent = '연결하지 못했어요 · 방 코드와 인터넷을 확인해 주세요';
      else st.textContent = '부부 공유 꺼짐 · 이 기기에만 저장돼요';
    }

    const foot = $('homeFootNote');
    if (foot) {
      foot.textContent = (m === 'live' || m === 'polling')
        ? `부부 방 ${share.room} · 두 사람이 함께 보고 있어요`
        : (m === 'offline' && share.room)
          ? '오프라인 · 다시 연결되면 자동으로 맞춰져요'
          : '기록은 이 기기 브라우저에만 저장돼요 · 부부 공유를 켜면 둘이 함께 봐요';
    }

    const sendBtn = $('shareSend');
    const leaveBtn = $('shareLeave');
    if (sendBtn) sendBtn.hidden = !share.room;
    if (leaveBtn) leaveBtn.hidden = !share.room;
  }

  /* ── 네트워크 ── */
  function fbRequest(method, url, body) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), REQ_TIMEOUT) : null;
    const opts = { method, cache: 'no-store' };
    if (ctrl) opts.signal = ctrl.signal;
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then((res) => {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }, (err) => {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function fbGet(url) {
    return fbRequest('GET', url).then((txt) => {
      try { return txt ? JSON.parse(txt) : null; } catch (e) { return null; }
    });
  }

  /* ── 연결 ── */
  function connectShare(opts) {
    const announce = !!(opts && opts.announce);
    closeStream();
    stopPolling();
    net.mirror = null;
    net.restarts = 0;
    net.fails = 0;
    net.announce = announce;
    net.joined = false;

    if (!shared()) { setMode('local'); return; }
    if (navigator.onLine === false) { setMode('offline'); return; }
    setMode('connecting');
    openStream();
  }

  function openStream() {
    closeStream();
    if (!shared()) { setMode('local'); return; }
    if (typeof EventSource !== 'function') { startPolling(); return; }

    let es;
    const url = roomUrl();
    try {
      es = new EventSource(url);
    } catch (e) {
      console.warn('실시간 연결을 시작하지 못했어요', e);
      startPolling();
      return;
    }
    net.es = es;
    net.lastEvent = Date.now();

    es.addEventListener('open', () => {
      if (net.es !== es) return;
      net.lastEvent = Date.now();
      net.restarts = 0;
      net.fails = 0;
      if (net.mode !== 'live') setMode('live');
      startWatchdog();
      if (net.announce) {
        net.announce = false;
        showToast(`부부 방 ${share.room} 연결됐어요 💗`);
      }
    });
    es.addEventListener('put', (ev) => {
      if (net.es !== es) return;
      net.lastEvent = Date.now();
      onStream('put', ev.data);
    });
    es.addEventListener('patch', (ev) => {
      if (net.es !== es) return;
      net.lastEvent = Date.now();
      onStream('patch', ev.data);
    });
    es.addEventListener('keep-alive', () => {
      if (net.es !== es) return;
      net.lastEvent = Date.now();
    });

    es.onerror = () => {
      if (net.es !== es) return;
      net.lastEvent = 0;
      if (es.readyState === 2 /* CLOSED */) {
        es.close();
        net.es = null;
        net.restarts += 1;
        if (net.restarts >= 2) { startPolling(); return; }
        setMode('connecting');
        setTimeout(() => { if (shared() && navigator.onLine !== false) openStream(); }, 1500);
      } else {
        setMode('connecting');
      }
    };
  }

  function closeStream() {
    if (net.es) {
      try { net.es.close(); } catch (e) { /* 무시 */ }
      net.es = null;
    }
    if (net.watchTimer) { clearInterval(net.watchTimer); net.watchTimer = null; }
  }

  function startWatchdog() {
    if (net.watchTimer) clearInterval(net.watchTimer);
    net.watchTimer = setInterval(() => {
      if (net.mode !== 'live') return;
      if (navigator.onLine === false) { setMode('offline'); return; }
      if (!net.lastEvent) return;
      if (Date.now() - net.lastEvent > STREAM_IDLE_MS) {
        net.lastEvent = Date.now();
        openStream();
      }
    }, 15000);
  }

  function startPolling() {
    closeStream();
    if (!shared()) { setMode('local'); return; }
    if (net.pollTimer) return;
    setMode('polling');
    const tick = () => {
      fbGet(roomUrl()).then((data) => {
        net.fails = 0;
        applyMirror(data);
        if (net.mode !== 'polling') setMode('polling');
      }).catch(() => {
        net.fails += 1;
        if (navigator.onLine === false) setMode('offline');
        else if (net.fails >= 3) setMode('error');
      });
    };
    tick();
    net.pollTimer = setInterval(tick, POLL_MS);
  }

  function stopPolling() {
    if (net.pollTimer) { clearInterval(net.pollTimer); net.pollTimer = null; }
  }

  /* ── 스트림 데이터 → 미러 갱신 ── */
  function applyMirror(data) {
    net.mirror = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    reconcile();
  }

  function onStream(kind, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.path !== 'string') return;

    const segs = msg.path.split('/').filter(Boolean);
    if (!segs.length) {
      net.mirror = (kind === 'put' && msg.data && typeof msg.data === 'object' && !Array.isArray(msg.data)) ? msg.data : {};
    } else {
      if (!net.mirror || typeof net.mirror !== 'object') net.mirror = {};
      let node = net.mirror;
      for (let i = 0; i < segs.length - 1; i += 1) {
        if (!node[segs[i]] || typeof node[segs[i]] !== 'object') node[segs[i]] = {};
        node = node[segs[i]];
      }
      const last = segs[segs.length - 1];
      if (kind === 'patch' && msg.data && typeof msg.data === 'object' && node[last] && typeof node[last] === 'object') {
        const merged = Object.assign({}, node[last], msg.data);
        Object.keys(merged).forEach((k) => { if (merged[k] === null) delete merged[k]; });
        node[last] = merged;
      } else if (msg.data === null || msg.data === undefined) {
        delete node[last];
      } else {
        node[last] = msg.data;
      }
    }

    if (net.mode !== 'live') setMode('live');
    reconcile();
  }

  /* ── 병합 ── */
  function localRecords() {
    const m = new Map();
    state.records.forEach((r) => {
      m.set(r.id, {
        date: r.date, time: r.time, mood: r.mood || '', memo: r.memo || '',
        by: r.by || null, updatedAt: Number(r.updatedAt) || legacyStamp(r.date, r.time),
      });
    });
    Object.keys(state.tomb).forEach((id) => {
      m.set(id, { deleted: true, updatedAt: state.tomb[id] });
    });
    return m;
  }

  function remoteRecords(obj) {
    const m = new Map();
    if (!obj || typeof obj !== 'object') return m;
    Object.keys(obj).forEach((id) => {
      const v = obj[id];
      if (!v || typeof v !== 'object') return;
      if (v.deleted) { m.set(id, { deleted: true, updatedAt: Number(v.updatedAt) || 0 }); return; }
      if (!isDateKey(v.date)) return;
      const time = isTimeKey(v.time) ? v.time : '12:00';
      m.set(id, {
        date: v.date,
        time,
        mood: MOODS.includes(v.mood) ? v.mood : '',
        memo: typeof v.memo === 'string' ? v.memo.slice(0, 60) : '',
        by: v.by === 'wife' || v.by === 'husband' ? v.by : null,
        updatedAt: Number(v.updatedAt) || legacyStamp(v.date, time),
      });
    });
    return m;
  }

  function sameRec(a, b) {
    if (!!a.deleted !== !!b.deleted) return false;
    if (a.deleted) return true;
    return a.date === b.date && a.time === b.time && (a.mood || '') === (b.mood || '')
      && (a.memo || '') === (b.memo || '') && (a.by || null) === (b.by || null);
  }

  function reconcileMeta() {
    if (!net.mirror || typeof net.mirror !== 'object') return false;
    const first = !net.joined;
    let changed = false;

    // 함께한 첫날
    const rs = net.mirror.startDate;
    const rv = rs && typeof rs === 'object' && isDateKey(rs.value) ? rs.value : '';
    const ru = rs && typeof rs === 'object' ? (Number(rs.updatedAt) || 0) : 0;
    const lv = state.settings.startDate || '';
    const lu = Number(state.settings.startUpdatedAt) || 0;
    if (rs && (ru > lu || (first && rv && !touched.startDate && lv !== rv))) {
      if (lv !== rv) { state.settings.startDate = rv; changed = true; }
      state.settings.startUpdatedAt = ru;
    } else if (lv && (!rs || lv !== rv)) {
      if (!lu) state.settings.startUpdatedAt = Date.now();
      net.dirty.add(META_START);
      saveDirty();
    }

    // 통계 기준 시작일 (기본 2026-11-01 · 방에는 statsStartDate 로 저장)
    const ss = net.mirror.statsStartDate;
    const ssv = ss && typeof ss === 'object' && isDateKey(ss.value) ? ss.value : '';
    const ssu = ss && typeof ss === 'object' ? (Number(ss.updatedAt) || 0) : 0;
    const slv = state.settings.statsStartDate || '';
    const slu = Number(state.settings.statsStartUpdatedAt) || 0;
    if (ss && (ssu > slu || (first && !touched.statsStart && slv !== ssv))) {
      if (slv !== ssv) { state.settings.statsStartDate = ssv; changed = true; }
      state.settings.statsStartUpdatedAt = ssu;
    } else if (!ss || slv !== ssv) {
      state.settings.statsStartUpdatedAt = Date.now();
      net.dirty.add(META_STATS_START);
      saveDirty();
    }

    // 오늘의 사랑 표현 (같은 미션 · 같은 완료 상태)
    const rm = net.mirror.mission;
    if (rm && typeof rm === 'object' && isDateKey(rm.date)) {
      const rmu = Number(rm.updatedAt) || 0;
      const lmu = Number(state.mission.updatedAt) || 0;
      const same = state.mission.date === rm.date
        && state.mission.idx === rm.idx
        && (state.mission.done === true) === (rm.done === true);
      if (first && rm.date === todayKey() && !touched.mission && !same) {
        applyRemoteMission(rm, rmu);
        changed = true;
      } else if (rmu > lmu && !same) {
        applyRemoteMission(rm, rmu);
        changed = true;
      } else if (lmu > rmu && !same) {
        net.dirty.add(META_MISSION);
        saveDirty();
      }
    } else if (state.mission.date) {
      net.dirty.add(META_MISSION);
      saveDirty();
    }

    return changed;
  }

  function applyRemoteMission(rm, rmu) {
    const idx = Number(rm.idx);
    state.mission = {
      date: rm.date,
      idx: Number.isInteger(idx) && idx >= 0 && idx < MISSIONS.length ? idx : 0,
      done: rm.done === true,
      updatedAt: rmu,
    };
  }

  function reconcile() {
    if (!net.mirror || typeof net.mirror !== 'object') return;
    const rem = remoteRecords(net.mirror.records);
    const loc = localRecords();
    const before = state.records.length;
    const push = [];
    let changed = false;

    rem.forEach((r, id) => {
      const l = loc.get(id);
      if (!l || r.updatedAt > l.updatedAt) { applyRemote(id, r); loc.set(id, r); changed = true; }
      else if (l.updatedAt > r.updatedAt) push.push(id);
      else if (!sameRec(l, r)) { applyRemote(id, r); loc.set(id, r); changed = true; }
    });
    loc.forEach((l, id) => {
      if (!rem.has(id)) push.push(id);
    });

    const metaChanged = reconcileMeta();

    if (changed || metaChanged) {
      sortRecords(state.records);
      save();
      renderAll();
    }
    if (push.length) {
      push.forEach((id) => { net.dirty.add(id); });
      saveDirty();
      flush();
    }

    // 부부 방에 처음 들어갈 때: 기존 기록이 사라지지 않고 합쳐졌다는 안내
    if (!net.joined) {
      net.joined = true;
      if (rem.size === 0 && push.length) showToast(`내 하트 ${push.length}개를 부부 방에 올렸어요`);
      else if (push.length) showToast(`부부 방 기록과 합쳐서 ${state.records.length}개가 됐어요`);
      else if (state.records.length > before) showToast(`부부 방 하트 ${state.records.length - before}개를 받았어요`);
    }
    flush();
  }

  function applyRemote(id, v) {
    const i = state.records.findIndex((r) => r.id === id);
    if (v.deleted) {
      if (i >= 0) state.records.splice(i, 1);
      state.tomb[id] = Math.max(state.tomb[id] || 0, v.updatedAt || 0);
      return;
    }
    const rec = {
      id,
      date: v.date,
      time: v.time,
      mood: v.mood || '',
      memo: v.memo || '',
      by: v.by || null,
      updatedAt: v.updatedAt || Date.now(),
    };
    if (i >= 0) state.records[i] = rec;
    else state.records.push(rec);
    if (state.tomb[id]) delete state.tomb[id];
  }

  /* ── 올리기 ── */
  function markDirty(id) {
    if (!id || !share.url) return;
    net.dirty.add(id);
    saveDirty();
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 150);
  }

  function flush() {
    if (net.flushing) return;
    if (!shared()) return;
    if (!net.joined) return;   // 방의 첫 스냅숏을 받은 뒤에 올린다 (처음엔 서버가 기준)
    if (navigator.onLine === false) { setMode('offline'); return; }
    if (net.dirty.size === 0) return;

    net.flushing = true;
    const ids = Array.from(net.dirty);

    const step = (k) => {
      if (k >= ids.length) {
        net.flushing = false;
        if (net.dirty.size) setTimeout(flush, 600);
        return;
      }
      const id = ids[k];
      let url = '';
      let body = null;

      if (id === META_START) {
        if (!state.settings.startDate && !state.settings.startUpdatedAt) {
          net.dirty.delete(id); saveDirty(); step(k + 1); return;
        }
        url = metaUrl('startDate');
        body = { value: state.settings.startDate || '', updatedAt: state.settings.startUpdatedAt || Date.now() };
      } else if (id === META_STATS_START) {
        if (!state.settings.statsStartDate && !state.settings.statsStartUpdatedAt) {
          net.dirty.delete(id); saveDirty(); step(k + 1); return;
        }
        url = metaUrl('statsStartDate');
        body = { value: state.settings.statsStartDate || '', updatedAt: state.settings.statsStartUpdatedAt || Date.now() };
      } else if (id === META_MISSION) {
        if (!state.mission.date) {
          net.dirty.delete(id); saveDirty(); step(k + 1); return;
        }
        url = metaUrl('mission');
        body = {
          date: state.mission.date,
          idx: state.mission.idx,
          done: state.mission.done === true,
          updatedAt: state.mission.updatedAt || Date.now(),
        };
      } else {
        const rec = state.records.find((r) => r.id === id);
        if (rec) {
          url = recordUrl(id);
          body = {
            date: rec.date, time: rec.time, mood: rec.mood || '', memo: rec.memo || '',
            by: rec.by || null, updatedAt: rec.updatedAt || Date.now(),
          };
        } else if (state.tomb[id]) {
          url = recordUrl(id);
          body = { deleted: true, updatedAt: state.tomb[id] };
        } else {
          net.dirty.delete(id); saveDirty(); step(k + 1); return;
        }
      }

      fbRequest('PUT', url, body).then(() => {
        net.dirty.delete(id);
        saveDirty();
        step(k + 1);
      }).catch(() => {
        net.flushing = false;
        if (navigator.onLine === false) setMode('offline');
      });
    };
    step(0);
  }

  /** 오래된 삭제 표시는 서버에서도 정리 */
  function pruneTombstones() {
    if (!shared()) return;
    const now = Date.now();
    Object.keys(state.tomb).forEach((id) => {
      if (now - state.tomb[id] < TOMB_KEEP_MS) return;
      delete state.tomb[id];
      if (net.mirror && net.mirror.records) delete net.mirror.records[id];
      fbRequest('DELETE', recordUrl(id)).catch(() => { /* 다음 기회에 */ });
    });
    save();
  }

  /* ── 공유 시트 ── */
  function openShareSheet() {
    $('roomInput').value = share.room;
    $('dbInput').value = share.url || normDb(DEFAULT_FIREBASE_URL);
    $('advBox').open = !!share.url && share.url !== normDb(DEFAULT_FIREBASE_URL);
    $('advHint').textContent = share.url && share.url !== normDb(DEFAULT_FIREBASE_URL) ? '(직접 설정함)' : '(기본 주소 사용 중)';
    $('shareNote').textContent = share.room
      ? '방 코드를 바꾸면 다른 부부 방으로 옮겨가요. 기록은 그대로 남아요.'
      : '방 코드를 아는 두 사람만 기록을 함께 볼 수 있어요. PIN 잠금은 기기마다 따로예요.';
    renderShare();
    openSheet($('shareSheet'), $('roomInput'));
  }

  function closeShareSheet() {
    closeSheet($('shareSheet'));
  }

  function randomRoom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function saveShareFromSheet() {
    const url = normDb($('dbInput').value || DEFAULT_FIREBASE_URL);
    const room = normRoom($('roomInput').value);

    if (!url) { $('advBox').open = true; $('dbInput').focus(); showToast('연결 주소가 없어요'); return; }
    if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) { $('advBox').open = true; showToast('주소 형식을 확인해 주세요'); return; }
    if (!roomValid(room)) {
      showToast('방 코드는 2~12자로 정해 주세요');
      $('roomInput').value = room;
      $('roomInput').focus();
      return;
    }

    const changed = url !== share.url || room !== share.room;
    share.url = url;
    share.room = room;
    persistShare();
    closeShareSheet();
    connectShare({ announce: changed });
  }

  function leaveShare() {
    const ok = window.confirm('부부 공유를 끄고 이 기기에만 저장할까요?\n이 기기의 기록은 그대로 남아요.');
    if (!ok) return;
    share.room = '';
    persistShare();
    closeStream();
    stopPolling();
    net.mirror = null;
    net.dirty.clear();
    saveDirty();
    setMode('local');
    closeShareSheet();
    showToast('부부 공유를 껐어요 · 이 기기에만 저장해요');
  }

  function copyInviteLink() {
    if (!roomReady()) return;
    const link = inviteLink();
    const text = `💗 하트노트 부부 방 「${share.room}」\n아래 링크를 열면 바로 연결돼요.\n${link}`;
    const done = () => showToast('초대 링크를 복사했어요');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => showToast(`링크: ${link}`, '', null, 6500));
    } else {
      showToast(`링크: ${link}`, '', null, 6500);
    }
  }

  /* ───────── 통계 ──────── */
  /** 통계 기준 시작일(오늘보다 미래면 오늘로). 없으면 null = 전체 기록 */
  function statsFloor(today) {
    if (!isDateKey(state.settings.statsStartDate)) return null;
    const d = parseKey(state.settings.statsStartDate);
    return d > today ? today : d;
  }

  function fmtDot(k) {
    return isDateKey(k) ? k.replace(/-/g, '.') : '';
  }

  function computeStats() {
    const today = startOfDay();
    const floor = statsFloor(today);
    const all = state.records
      .map((r) => ({ ...r, d: parseKey(r.date) }))
      .filter((r) => r.d <= today && (!floor || r.d >= floor))
      .sort((a, b) => (a.d - b.d) || a.time.localeCompare(b.time));

    const first = all.length ? all[0].d : null;
    const windows = {};
    WINDOWS.forEach((w) => {
      const winStart = new Date(today);
      winStart.setDate(winStart.getDate() - (w.days - 1));
      let start = winStart;
      if (floor && floor > start) start = floor;
      // 통계 기준일이 있으면 그날부터 경과 일수를 세고, 없으면 첫 기록부터
      if (!floor && first && first > start) start = first;
      const count = all.filter((r) => r.d >= start).length;
      const covered = diffDays(start, today) + 1;
      windows[w.key] = {
        count,
        days: w.days,
        covered,
        interval: count >= 2 ? covered / count : null,
      };
    });

    const monthCount = all.filter((r) => r.d.getFullYear() === today.getFullYear() && r.d.getMonth() === today.getMonth()).length;
    const yearCount = all.filter((r) => r.d.getFullYear() === today.getFullYear()).length;
    const todayCount = all.filter((r) => r.date === dateKey(today)).length;

    const months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        key: `${m.getFullYear()}-${m.getMonth()}`,
        label: `${m.getMonth() + 1}월`,
        count: all.filter((r) => r.d.getFullYear() === m.getFullYear() && r.d.getMonth() === m.getMonth()).length,
        current: i === 0,
      });
    }

    const moodCounts = {};
    MOODS.forEach((m) => { moodCounts[m] = 0; });
    let tagged = 0;
    all.forEach((r) => {
      if (r.mood && moodCounts[r.mood] !== undefined) { moodCounts[r.mood] += 1; tagged += 1; }
    });

    return {
      all, windows, monthCount, yearCount, todayCount, months, moodCounts, tagged,
      total: all.length, base: floor, baseDays: floor ? diffDays(floor, today) + 1 : null,
    };
  }

  /* ───────── 달력 상태 ───────── */
  const now = new Date();
  let calY = now.getFullYear();
  let calM = now.getMonth();
  let daySheetDate = '';

  /* ───────── 렌더 ───────── */
  function renderHeader() {
    const d = new Date();
    $('headDate').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`;
  }

  function renderHome() {
    const st = computeStats();
    $('chipToday').textContent = st.todayCount;
    $('chipMonth').textContent = st.monthCount;
    $('chipYear').textContent = st.yearCount;

    const heartBtn = $('heartBtn');
    heartBtn.classList.toggle('has-today', st.todayCount > 0);
    $('heartPlus').textContent = st.todayCount > 0 ? '♥' : '+';
    if (st.todayCount > 0) {
      $('heroTitle').textContent = `오늘 ${st.todayCount}번, 사랑을 남겼어요`;
      $('heroSub').textContent = '한 번 더 남기려면 하트를 다시 눌러요';
    } else {
      $('heroTitle').textContent = '오늘은 아직 하트가 없어요';
      $('heroSub').textContent = '하트를 누르면 오늘 날짜로 기록돼요';
    }

    const loveLine = $('loveLine');
    if (state.settings.startDate) {
      const days = diffDays(parseKey(state.settings.startDate), new Date()) + 1;
      $('loveDays').textContent = `${Math.max(days, 1)}일`;
      loveLine.hidden = false;
    } else {
      loveLine.hidden = true;
    }

    renderRecent();
    renderMission();
  }

  function renderRecent() {
    const box = $('recentList');
    const items = state.records.slice(0, 4);
    if (!items.length) {
      box.innerHTML = '<p class="empty">아직 기록이 없어요.<br>위의 하트를 눌러 첫 하트를 남겨 보세요.</p>';
      return;
    }
    box.innerHTML = items.map((r) => `
      <button type="button" class="rec-row" data-id="${r.id}" aria-label="${fmtDate(r.date)} ${fmtTime(r.time)} 기록 열기">
        <span class="rec-heart" aria-hidden="true"><svg viewBox="0 0 24 22"><path d="M12 21S1.5 14.6 1.5 7.6C1.5 3.9 4.4 1 8 1c1.7 0 3.2.7 4 1.9C12.8 1.7 14.3 1 16 1c3.6 0 6.5 2.9 6.5 6.6C22.5 14.6 12 21 12 21z"/></svg></span>
        <span class="rec-main">
          <span class="rec-line1">
            <span class="rec-date">${fmtDate(r.date)}</span>
            <span class="rec-time">${fmtTime(r.time)}</span>
            ${r.mood ? `<span class="rec-mood">${MOOD_EMOJI[r.mood]} ${r.mood}</span>` : ''}
            ${r.by ? `<span class="rec-by">${byLabel(r.by)}</span>` : ''}
          </span>
          ${r.memo ? `<span class="rec-memo">${escapeHtml(r.memo)}</span>` : ''}
        </span>
        <span class="rec-arrow" aria-hidden="true">›</span>
      </button>
    `).join('');
  }

  function renderMission() {
    ensureMission();
    const m = MISSIONS[state.mission.idx] || MISSIONS[0];
    $('missionText').textContent = m.t;
    $('missionSub').textContent = m.s;
    $('missionDone').setAttribute('aria-pressed', state.mission.done ? 'true' : 'false');
    $('missionDone').innerHTML = '<span class="check" aria-hidden="true">✓</span> 오늘 했어요';
  }

  function renderStats() {
    const st = computeStats();
    $('statMonth').textContent = st.monthCount;
    $('statYear').textContent = st.yearCount;

    if ($('statsBase')) {
      $('statsBase').textContent = st.base
        ? `통계 기준: ${fmtDot(dateKey(st.base))} ~`
        : '통계 기준: 전체 기록 ~';
    }

    $('avgGrid').innerHTML = WINDOWS.map((w) => {
      const a = st.windows[w.key];
      let intervalText;
      let empty = false;
      if (a.count === 0) { intervalText = '이 기간 기록 없음'; empty = true; }
      else if (a.interval == null) { intervalText = '2회부터 계산돼요'; empty = true; }
      else { intervalText = `평균 ${fmtNum(a.interval)}일마다`; }
      // 통계 기준일·첫 기록 때문에 기간보다 짧게 세면 그 일수를 같이 보여 준다
      const rangeText = a.covered < w.days ? `${a.covered}일치` : `최근 ${w.days}일`;
      return `
        <div class="avg-card" data-window="${w.key}">
          <div class="avg-head"><span class="avg-label">${w.label}</span><span class="avg-range">${rangeText}</span></div>
          <div class="avg-count">${a.count}<small>회</small></div>
          <div class="avg-interval${empty ? ' is-empty' : ''}">${intervalText}</div>
        </div>`;
    }).join('');

    const maxCount = Math.max(1, ...st.months.map((m) => m.count));
    const chartSum = st.months.reduce((sum, m) => sum + m.count, 0);
    const chartEl = $('monthChart');
    $('chartTotal').textContent = `${chartSum}회`;
    if (!chartSum) {
      chartEl.classList.add('is-empty');
      chartEl.innerHTML = '<p class="empty">이 기간에는 기록이 없어요.<br>하트를 남기면 달마다 막대로 보여 드릴게요.</p>';
    } else {
      chartEl.classList.remove('is-empty');
      chartEl.innerHTML = st.months.map((m) => {
        const h = m.count ? Math.max(8, Math.round((m.count / maxCount) * 100)) : 3;
        return `
        <div class="chart-col${m.current ? ' is-current' : ''}${m.count ? '' : ' is-zero'}">
          <span class="chart-val">${m.count || ''}</span>
          <span class="chart-bar-wrap"><span class="chart-bar" style="height:${h}%"></span></span>
          <span class="chart-label">${m.label}</span>
        </div>`;
      }).join('');
    }

    $('moodTotal').textContent = `태그 ${st.tagged}개`;
    const moodEl = $('moodStats');
    moodEl.classList.toggle('is-empty', !st.total);
    moodEl.innerHTML = st.total
      ? MOODS.map((m) => `<span class="mood-chip"><i aria-hidden="true">${MOOD_EMOJI[m]}</i>${m} <b>${st.moodCounts[m]}</b></span>`).join('')
      : '<p class="empty" style="padding:12px 4px">기록에 기분을 남기면 여기에 모여요</p>';
  }

  function renderCalendar() {
    const today = startOfDay();
    $('calMonth').textContent = `${calY}년 ${calM + 1}월`;
    const isCurrent = calY === today.getFullYear() && calM === today.getMonth();
    $('calNext').setAttribute('aria-disabled', isCurrent ? 'true' : 'false');
    $('calNext').style.opacity = isCurrent ? '.35' : '1';

    const counts = new Map();
    state.records.forEach((r) => counts.set(r.date, (counts.get(r.date) || 0) + 1));

    const firstDow = new Date(calY, calM, 1).getDay();
    const daysInMonth = new Date(calY, calM + 1, 0).getDate();
    const prevMonthDays = new Date(calY, calM, 0).getDate();
    const cells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

    let html = '';
    for (let i = 0; i < cells; i += 1) {
      const dayNum = i - firstDow + 1;
      let y = calY; let m = calM; let dNum = dayNum; let out = false;
      if (dayNum < 1) { out = true; dNum = prevMonthDays + dayNum; m = calM - 1; if (m < 0) { m = 11; y -= 1; } }
      else if (dayNum > daysInMonth) { out = true; dNum = dayNum - daysInMonth; m = calM + 1; if (m > 11) { m = 0; y += 1; } }
      const key = `${y}-${pad(m + 1)}-${pad(dNum)}`;
      const count = out ? 0 : (counts.get(key) || 0);
      const isToday = key === dateKey(today);
      const cls = ['cal-cell'];
      if (out) cls.push('out');
      if (isToday) cls.push('today');
      if (count) cls.push('has-heart');
      const label = `${m + 1}월 ${dNum}일${count ? `, 하트 ${count}개` : ''}${isToday ? ', 오늘' : ''}`;
      html += `
        <button type="button" class="${cls.join(' ')}" data-date="${key}" data-out="${out ? '1' : '0'}"
                aria-label="${label}" ${out ? 'tabindex="-1"' : ''}>
          <span class="cal-day">${dNum}</span>
          ${count ? '<span class="cal-heart" aria-hidden="true"><svg viewBox="0 0 24 22"><path d="M12 21S1.5 14.6 1.5 7.6C1.5 3.9 4.4 1 8 1c1.7 0 3.2.7 4 1.9C12.8 1.7 14.3 1 16 1c3.6 0 6.5 2.9 6.5 6.6C22.5 14.6 12 21 12 21z"/></svg></span>' : '<span class="cal-heart" aria-hidden="true"></span>'}
          ${count > 1 ? `<span class="cal-count">${count}</span>` : ''}
        </button>`;
    }
    $('calGrid').innerHTML = html;

    let dayTotal = 0; let heartTotal = 0;
    counts.forEach((v, k) => {
      const d = parseKey(k);
      if (d.getFullYear() === calY && d.getMonth() === calM) { dayTotal += 1; heartTotal += v; }
    });
    $('calSumDays').textContent = `${dayTotal}일`;
    $('calSumHearts').textContent = `하트 ${heartTotal}개`;
    $('calSub').textContent = dayTotal ? '하트가 있는 날을 눌러 보세요' : '이 달에는 아직 하트가 없어요';
  }

  function renderSettings() {
    const on = state.settings.pinOn && !!state.settings.pin;
    $('pinToggle').setAttribute('aria-checked', on ? 'true' : 'false');
    $('pinToggle').setAttribute('aria-label', on ? 'PIN 잠금 끄기' : 'PIN 잠금 켜기');
    $('pinChangeRow').hidden = !on;
    $('pinLockRow').hidden = !on;

    $('startDate').value = state.settings.startDate || '';
    if (state.settings.startDate) {
      const days = diffDays(parseKey(state.settings.startDate), new Date()) + 1;
      $('startNote').textContent = `함께한 지 ${Math.max(days, 1)}일`;
    } else {
      $('startNote').textContent = '아직 정하지 않았어요';
    }

    $('statsStartDate').value = state.settings.statsStartDate || '';
    if (state.settings.statsStartDate) {
      const days = diffDays(parseKey(state.settings.statsStartDate), new Date()) + 1;
      $('statsStartNote').textContent = `${fmtDot(state.settings.statsStartDate)}부터 ${Math.max(days, 1)}일치로 계산해요`;
    } else {
      $('statsStartNote').textContent = '비우면 모든 기록으로 계산해요';
    }
  }

  function renderAll() {
    renderHeader();
    renderHome();
    renderStats();
    renderCalendar();
    renderSettings();
    refreshDaySheet();
    renderShare();
  }

  /* ───────── 화면 전환 ───────── */
  const VIEW_TITLES = { home: '홈', stats: '통계', calendar: '달력', settings: '설정' };
  let currentView = 'home';

  function setView(name) {
    if (!VIEW_TITLES[name]) return;
    currentView = name;
    ['home', 'stats', 'calendar', 'settings'].forEach((v) => {
      $('view-' + v).hidden = v !== name;
    });
    document.querySelectorAll('.tab').forEach((t) => {
      const active = t.dataset.view === name;
      t.classList.toggle('is-active', active);
      if (active) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ───────── 시트 공통 ───────── */
  let sheetZ = 110;
  /* 모달·추가창 화면 고정 (2026-11-28)
     열 때 스크롤 위치를 저장하고 body를 fixed로 잠가 배경이 흔들리지 않게 한다.
     시트가 겹쳐 열리거나 PIN 잠금 화면과 겹쳐도 마지막 창이 닫힐 때만 원래 위치로 돌아간다. */
  let lockedScrollY = null;

  function syncModalLock() {
    const anySheet = Array.from(document.querySelectorAll('.sheet-backdrop')).some((s) => !s.hidden);
    const anyOpen = anySheet || !$('lockScreen').hidden;
    const isLocked = document.body.classList.contains('modal-open');

    if (anyOpen && !isLocked) {
      lockedScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.classList.add('modal-open');
    } else if (!anyOpen && isLocked) {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      const backY = lockedScrollY || 0;
      lockedScrollY = null;
      window.scrollTo(0, backY);
    }
  }

  function openSheet(el, focusEl) {
    lastFocus = document.activeElement;
    sheetZ += 1;
    el.style.zIndex = String(sheetZ);
    el.hidden = false;
    syncModalLock();
    if (focusEl) setTimeout(() => { try { focusEl.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }, 60);
  }

  function closeSheet(el) {
    el.hidden = true;
    const anyOpen = Array.from(document.querySelectorAll('.sheet-backdrop')).some((s) => !s.hidden);
    if (!anyOpen) sheetZ = 110;
    syncModalLock();
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
    }
  }

  document.querySelectorAll('.sheet-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeSheet(backdrop);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = Array.from(document.querySelectorAll('.sheet-backdrop')).filter((s) => !s.hidden);
    if (open.length) closeSheet(open[open.length - 1]);
  });

  /* ───────── 기록 시트 ───────── */
  let sheetRecordId = null;
  let draftMood = '';

  function updateMoodButtons() {
    document.querySelectorAll('#recMoods .mood').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.mood === draftMood ? 'true' : 'false');
    });
  }

  function updateMemoCount() {
    const v = $('recMemo').value;
    $('memoCount').textContent = `${v.length}/60`;
  }

  function openRecordSheet(record, presetDate) {
    sheetRecordId = record ? record.id : null;
    $('recordTitle').textContent = record ? '기록 수정' : '사랑 기록 남기기';
    $('recDate').value = record ? record.date : (presetDate || todayKey());
    $('recDate').max = todayKey();
    $('recTime').value = record ? record.time : nowTime();
    draftMood = record ? record.mood : '';
    $('recMemo').value = record ? record.memo : '';
    $('recDelete').hidden = !record;
    updateMoodButtons();
    updateMemoCount();
    openSheet($('recordSheet'), $('recDate'));
  }

  function addRecord(data, onDone) {
    const rec = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: data.date,
      time: data.time || nowTime(),
      mood: data.mood || '',
      memo: (data.memo || '').trim().slice(0, 60),
      by: data.by || null,
      updatedAt: Date.now(),
    };
    state.records.unshift(rec);
    sortRecords(state.records);
    save();
    markDirty(rec.id);
    renderAll();
    if (onDone) onDone(rec);
    return rec;
  }

  function deleteRecord(id) {
    const idx = state.records.findIndex((r) => r.id === id);
    if (idx < 0) return;
    lastDeleted = state.records.splice(idx, 1)[0];
    state.tomb[id] = Date.now();
    save();
    markDirty(id);
    renderAll();
    showToast('기록을 지웠어요', '되돌리기', () => {
      if (!lastDeleted) return;
      lastDeleted.updatedAt = Date.now();
      state.records.push(lastDeleted);
      delete state.tomb[lastDeleted.id];
      lastDeleted = null;
      sortRecords(state.records);
      save();
      markDirty(id);
      renderAll();
      showToast('되돌렸어요');
    }, 5200);
  }

  $('recMoods').addEventListener('click', (e) => {
    const btn = e.target.closest('.mood');
    if (!btn) return;
    draftMood = draftMood === btn.dataset.mood ? '' : btn.dataset.mood;
    updateMoodButtons();
  });

  $('recMemo').addEventListener('input', updateMemoCount);

  $('recCancel').addEventListener('click', () => closeSheet($('recordSheet')));

  $('recSave').addEventListener('click', () => {
    const date = $('recDate').value;
    const time = $('recTime').value || nowTime();
    if (!date) { showToast('날짜를 골라 주세요'); return; }
    if (date > todayKey()) { showToast('오늘까지만 기록할 수 있어요'); return; }
    const memo = $('recMemo').value;
    if (sheetRecordId) {
      const rec = state.records.find((r) => r.id === sheetRecordId);
      if (rec) {
        rec.date = date; rec.time = time; rec.mood = draftMood; rec.memo = memo.trim().slice(0, 60);
        rec.updatedAt = Date.now();
        sortRecords(state.records);
        save();
        markDirty(rec.id);
        renderAll();
      }
      closeSheet($('recordSheet'));
      showToast('기록을 저장했어요');
    } else {
      addRecord({ date, time, mood: draftMood, memo });
      closeSheet($('recordSheet'));
      showToast('기록을 저장했어요');
    }
  });

  $('recDelete').addEventListener('click', () => {
    const id = sheetRecordId;
    closeSheet($('recordSheet'));
    if (id) deleteRecord(id);
  });

  document.addEventListener('click', (e) => {
    const row = e.target.closest('.rec-row');
    if (!row || !row.dataset.id) return;
    const rec = state.records.find((r) => r.id === row.dataset.id);
    if (rec) openRecordSheet(rec);
  });

  /* ───────── 하트 버튼 ───────── */
  function popHeart() {
    const heartBtn = $('heartBtn');
    heartBtn.classList.add('is-pop');
    setTimeout(() => heartBtn.classList.remove('is-pop'), 520);

    const burst = $('heartBurst');
    burst.innerHTML = '';
    for (let i = 0; i < 9; i += 1) {
      const s = document.createElement('i');
      const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.35;
      const dist = 48 + Math.random() * 34;
      s.style.setProperty('--dx', `${Math.cos(a) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * dist - 10}px`);
      s.style.left = `${50 + Math.cos(a) * 3}%`;
      s.style.top = `${52 + Math.sin(a) * 3}%`;
      s.style.background = i % 3 === 0 ? '#FFB4CB' : (i % 3 === 1 ? '#FF6F9C' : '#F0427C');
      burst.appendChild(s);
    }
    burst.classList.add('pop');
    setTimeout(() => { burst.classList.remove('pop'); burst.innerHTML = ''; }, 720);
  }

  $('heartBtn').addEventListener('click', () => {
    popHeart();
    const rec = addRecord({ date: todayKey(), time: nowTime(), by: who });
    showToast('오늘의 하트를 남겼어요', '메모 남기기', () => openRecordSheet(rec), 5000);
  });

  /* ───────── 미션 ───────── */
  function ensureMission() {
    const t = todayKey();
    if (state.mission.date !== t) {
      state.mission = { date: t, idx: Math.floor(Math.random() * MISSIONS.length), done: false, updatedAt: Date.now() };
      save();
      markDirty(META_MISSION);
    }
  }

  $('missionShuffle').addEventListener('click', () => {
    const cur = state.mission.idx;
    let next = cur;
    while (next === cur && MISSIONS.length > 1) next = Math.floor(Math.random() * MISSIONS.length);
    state.mission.idx = next;
    state.mission.done = false;
    state.mission.date = todayKey();
    state.mission.updatedAt = Date.now();
    touched.mission = true;
    save();
    markDirty(META_MISSION);
    renderMission();
  });

  $('missionDone').addEventListener('click', () => {
    state.mission.done = !state.mission.done;
    state.mission.updatedAt = Date.now();
    touched.mission = true;
    save();
    markDirty(META_MISSION);
    renderMission();
    if (state.mission.done) showToast('오늘의 사랑 표현, 멋져요 💗');
  });

  /* ───────── 달력 ───────── */
  $('calPrev').addEventListener('click', () => {
    calM -= 1;
    if (calM < 0) { calM = 11; calY -= 1; }
    renderCalendar();
  });

  $('calNext').addEventListener('click', () => {
    const t = new Date();
    if (calY === t.getFullYear() && calM === t.getMonth()) return;
    calM += 1;
    if (calM > 11) { calM = 0; calY += 1; }
    renderCalendar();
  });

  $('calMonth').addEventListener('click', () => {
    const t = new Date();
    calY = t.getFullYear(); calM = t.getMonth();
    renderCalendar();
    showToast('이번 달로 돌아왔어요');
  });

  $('calGrid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell');
    if (!cell) return;
    const key = cell.dataset.date;
    if (!key) return;
    if (key > todayKey()) { showToast('아직 오지 않은 날이에요'); return; }
    openDaySheet(key);
  });

  $('calAdd').addEventListener('click', () => {
    openRecordSheet(null, todayKey());
  });

  /* ───────── 날짜 시트 ───────── */
  function renderDaySheet(key) {
    daySheetDate = key;
    $('dayTitle').textContent = fmtDate(key, { alwaysYear: true });
    const list = state.records
      .filter((r) => r.date === key)
      .sort((a, b) => b.time.localeCompare(a.time));
    $('dayList').innerHTML = list.length
      ? list.map((r) => `
        <button type="button" class="rec-row" data-id="${r.id}" aria-label="${fmtTime(r.time)} 기록 열기">
          <span class="rec-heart" aria-hidden="true"><svg viewBox="0 0 24 22"><path d="M12 21S1.5 14.6 1.5 7.6C1.5 3.9 4.4 1 8 1c1.7 0 3.2.7 4 1.9C12.8 1.7 14.3 1 16 1c3.6 0 6.5 2.9 6.5 6.6C22.5 14.6 12 21 12 21z"/></svg></span>
          <span class="rec-main">
            <span class="rec-line1">
              <span class="rec-date">${fmtTime(r.time)}</span>
              ${r.mood ? `<span class="rec-mood">${MOOD_EMOJI[r.mood]} ${r.mood}</span>` : ''}
            </span>
            ${r.memo ? `<span class="rec-memo">${escapeHtml(r.memo)}</span>` : ''}
          </span>
          <span class="rec-arrow" aria-hidden="true">›</span>
        </button>`).join('')
      : '<p class="empty">이 날은 기록이 없어요.<br>아래 버튼으로 남겨 보세요.</p>';
  }

  function refreshDaySheet() {
    if ($('daySheet').hidden || !daySheetDate) return;
    renderDaySheet(daySheetDate);
  }

  function openDaySheet(key) {
    renderDaySheet(key);
    openSheet($('daySheet'));
  }

  $('dayClose').addEventListener('click', () => closeSheet($('daySheet')));

  $('dayAdd').addEventListener('click', () => {
    const key = daySheetDate;
    closeSheet($('daySheet'));
    openRecordSheet(null, key);
  });

  /* ───────── 백업 / 복원 ───────── */
  function backupData() {
    const payload = {
      app: 'heartnote',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: { startDate: state.settings.startDate, statsStartDate: state.settings.statsStartDate },
      records: state.records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `하트노트-백업-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast(`기록 ${state.records.length}개를 백업했어요`);
  }

  function applyRestore(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { showToast('백업 파일을 읽지 못했어요'); return false; }
    const rawList = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.records) ? parsed.records : null);
    if (!rawList) { showToast('하트노트 백업 파일이 아니에요'); return false; }
    const cleaned = sortRecords(rawList.map(normalizeRecord).filter(Boolean));
    if (!cleaned.length && rawList.length) { showToast('복원할 기록을 찾지 못했어요'); return false; }
    if (state.records.length) {
      const ok = window.confirm(`지금 기록 ${state.records.length}개를 백업 파일의 ${cleaned.length}개로 바꿀까요?`);
      if (!ok) return false;
    }
    const keep = new Set(cleaned.map((r) => r.id));
    const stamp = Date.now();
    const gone = [];
    state.records.forEach((r) => { if (!keep.has(r.id)) { state.tomb[r.id] = stamp; gone.push(r.id); } });
    state.records = cleaned;
    cleaned.forEach((r) => { r.updatedAt = stamp; });
    if (parsed && parsed.settings && isDateKey(parsed.settings.startDate)) {
      state.settings.startDate = parsed.settings.startDate;
      state.settings.startUpdatedAt = stamp;
    }
    if (parsed && parsed.settings && typeof parsed.settings.statsStartDate === 'string') {
      state.settings.statsStartDate = isDateKey(parsed.settings.statsStartDate) ? parsed.settings.statsStartDate : '';
      state.settings.statsStartUpdatedAt = stamp;
    }
    // 백업에는 PIN이 담기지 않으므로 복원 후 잠금은 꺼 둔다 (PIN 분실 복구 경로)
    state.settings.pinOn = false;
    state.settings.pin = '';
    save();
    cleaned.forEach((r) => markDirty(r.id));
    gone.forEach((id) => markDirty(id));
    if (state.settings.startUpdatedAt) markDirty(META_START);
    if (state.settings.statsStartUpdatedAt) markDirty(META_STATS_START);
    unlock();
    closeSheet($('forgotSheet'));
    renderAll();
    showToast(`기록 ${cleaned.length}개를 복원했어요 · PIN 잠금은 꺼졌어요`, '', null, 5000);
    return true;
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => applyRestore(String(reader.result || ''));
    reader.onerror = () => showToast('파일을 읽지 못했어요');
    reader.readAsText(file);
  }

  $('btnBackup').addEventListener('click', backupData);
  $('btnRestore').addEventListener('click', () => $('fileInput').click());

  $('fileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) readFile(file);
    e.target.value = '';
  });

  $('btnReset').addEventListener('click', () => {
    if (!state.records.length) { showToast('지울 기록이 없어요'); return; }
    const ok = window.confirm(`기록 ${state.records.length}개를 모두 지울까요? 되돌릴 수 없어요.`);
    if (!ok) return;
    const now = Date.now();
    const ids = state.records.map((r) => r.id);
    ids.forEach((id) => { state.tomb[id] = now; });
    state.records = [];
    state.mission.done = false;
    state.mission.updatedAt = now;
    save();
    ids.forEach((id) => markDirty(id));
    markDirty(META_MISSION);
    renderAll();
    showToast('모든 기록을 지웠어요');
  });

  /* ───────── 설정: 시작일 ───────── */
  $('startDate').addEventListener('change', () => {
    const v = $('startDate').value;
    if (v && v > todayKey()) { showToast('오늘 이전 날짜로 정해 주세요'); $('startDate').value = state.settings.startDate || ''; return; }
    state.settings.startDate = v || '';
    state.settings.startUpdatedAt = Date.now();
    touched.startDate = true;
    save();
    markDirty(META_START);
    renderSettings();
    renderHome();
    if (v) showToast('함께한 날을 세어 드릴게요');
  });

  $('startClear').addEventListener('click', () => {
    state.settings.startDate = '';
    state.settings.startUpdatedAt = Date.now();
    touched.startDate = true;
    $('startDate').value = '';
    save();
    markDirty(META_START);
    renderSettings();
    renderHome();
    showToast('시작일을 지웠어요');
  });

  /* ───────── 설정: 통계 기준 시작일 ──────── */
  function setStatsStart(v) {
    state.settings.statsStartDate = v || '';
    state.settings.statsStartUpdatedAt = Date.now();
    touched.statsStart = true;
    $('statsStartDate').value = v || '';
    save();
    markDirty(META_STATS_START);
    renderSettings();
    renderStats();
    renderHome();
  }

  $('statsStartDate').addEventListener('change', () => {
    const v = $('statsStartDate').value;
    if (v && v > todayKey()) {
      showToast('오늘 이전 날짜로 정해 주세요');
      $('statsStartDate').value = state.settings.statsStartDate || '';
      return;
    }
    setStatsStart(v);
    showToast(v ? `${fmtDot(v)}부터 통계를 세요` : '모든 기록으로 통계를 세요');
  });

  $('statsStartReset').addEventListener('click', () => {
    setStatsStart(DEFAULT_STATS_START);
    showToast(`기본 통계 기준(${fmtDot(DEFAULT_STATS_START)})으로 돌렸어요`);
  });

  /* ───────── PIN ───────── */
  let pinMode = 'set';       // set | off | change
  let pinStep = 'input';     // input | new
  let pinBuffer = '';
  let hiddenAt = 0;

  function updateDots() {
    const dots = $('lockDots').children;
    for (let i = 0; i < dots.length; i += 1) dots[i].classList.toggle('on', i < pinBuffer.length);
  }

  function lock() {
    if (!(state.settings.pinOn && state.settings.pin)) return;
    pinBuffer = '';
    updateDots();
    $('lockHint').textContent = 'PIN 4자리를 입력해 주세요';
    $('lockScreen').hidden = false;
    $('appRoot').setAttribute('aria-hidden', 'true');
    $('appRoot').inert = true;
    syncModalLock();
  }

  function unlock() {
    $('lockScreen').hidden = true;
    $('appRoot').removeAttribute('aria-hidden');
    $('appRoot').inert = false;
    syncModalLock();
    pinBuffer = '';
    updateDots();
  }

  function submitPin() {
    if (pinBuffer.length !== 4) return;
    if (pinBuffer === state.settings.pin) {
      unlock();
      return;
    }
    const dots = $('lockDots');
    dots.classList.add('shake');
    $('lockHint').textContent = 'PIN이 맞지 않아요. 다시 입력해 주세요';
    setTimeout(() => {
      dots.classList.remove('shake');
      pinBuffer = '';
      updateDots();
    }, 380);
  }

  $('lockKeypad').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-key]');
    if (!btn) return;
    const k = btn.dataset.key;
    if (k === 'del') pinBuffer = pinBuffer.slice(0, -1);
    else if (pinBuffer.length < 4) pinBuffer += k;
    updateDots();
    if (pinBuffer.length === 4) setTimeout(submitPin, 120);
  });

  document.addEventListener('keydown', (e) => {
    if ($('lockScreen').hidden) return;
    if (/^[0-9]$/.test(e.key) && pinBuffer.length < 4) {
      pinBuffer += e.key; updateDots();
      if (pinBuffer.length === 4) setTimeout(submitPin, 120);
    } else if (e.key === 'Backspace') {
      pinBuffer = pinBuffer.slice(0, -1); updateDots();
    }
  });

  $('lockForgot').addEventListener('click', () => openSheet($('forgotSheet')));
  $('forgotCancel').addEventListener('click', () => closeSheet($('forgotSheet')));
  $('forgotRestore').addEventListener('click', () => {
    closeSheet($('forgotSheet'));
    $('fileInput').click();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 60000) {
      hiddenAt = 0;
      lock();
    }
  });

  /* PIN 설정 시트 */
  function openPinSheet(mode) {
    pinMode = mode;
    pinStep = 'input';
    $('pinA').value = '';
    $('pinB').value = '';
    $('pinError').hidden = true;
    renderPinSheet();
    openSheet($('pinSheet'), $('pinA'));
  }

  function renderPinSheet() {
    const isSet = pinMode === 'set' || (pinMode === 'change' && pinStep === 'new');
    if (pinMode === 'set') {
      $('pinTitle').textContent = 'PIN 번호 설정';
      $('pinDesc').textContent = '앱을 열 때 물어볼 4자리 숫자를 정해 주세요.';
    } else if (pinMode === 'change' && pinStep === 'input') {
      $('pinTitle').textContent = 'PIN 번호 변경';
      $('pinDesc').textContent = '먼저 지금 쓰는 PIN을 확인할게요.';
    } else if (pinMode === 'change' && pinStep === 'new') {
      $('pinTitle').textContent = '새 PIN 번호';
      $('pinDesc').textContent = '새로 쓸 4자리 숫자를 두 번 입력해 주세요.';
    } else {
      $('pinTitle').textContent = 'PIN 잠금 끄기';
      $('pinDesc').textContent = '지금 쓰는 PIN을 입력하면 잠금이 꺼져요.';
    }
    $('pinLabelA').textContent = isSet ? '새 PIN 4자리' : '현재 PIN 4자리';
    $('pinRowB').hidden = !isSet;
    $('pinNote').textContent = pinMode === 'off'
      ? '잠금을 끄면 앱을 열 때 PIN을 묻지 않아요.'
      : 'PIN은 이 기기 안에만 저장되고 백업 파일에는 담기지 않아요.';
    $('pinError').hidden = true;
  }

  $('pinToggle').addEventListener('click', () => {
    const on = state.settings.pinOn && !!state.settings.pin;
    openPinSheet(on ? 'off' : 'set');
  });

  $('pinChange').addEventListener('click', () => openPinSheet('change'));
  $('pinCancel').addEventListener('click', () => closeSheet($('pinSheet')));

  $('pinSave').addEventListener('click', () => {
    const a = ($('pinA').value || '').trim();
    const b = ($('pinB').value || '').trim();
    const fail = (msg) => { $('pinError').textContent = msg; $('pinError').hidden = false; };

    if (pinMode === 'change' && pinStep === 'input') {
      if (!/^\d{4}$/.test(a)) return fail('4자리 숫자를 입력해 주세요.');
      if (a !== state.settings.pin) return fail('지금 쓰는 PIN이 맞지 않아요.');
      pinStep = 'new';
      $('pinA').value = ''; $('pinB').value = '';
      renderPinSheet();
      $('pinA').focus();
      return;
    }

    if (pinMode === 'off') {
      if (!/^\d{4}$/.test(a)) return fail('4자리 숫자를 입력해 주세요.');
      if (a !== state.settings.pin) return fail('PIN이 맞지 않아요.');
      state.settings.pinOn = false;
      state.settings.pin = '';
      save(); renderSettings(); closeSheet($('pinSheet'));
      showToast('PIN 잠금을 껐어요');
      return;
    }

    // set / change-new
    if (!/^\d{4}$/.test(a)) return fail('4자리 숫자를 입력해 주세요.');
    if (a !== b) return fail('두 번 입력한 PIN이 달라요.');
    state.settings.pin = a;
    state.settings.pinOn = true;
    save(); renderSettings(); closeSheet($('pinSheet'));
    showToast(pinMode === 'change' ? 'PIN 번호를 바꿨어요' : 'PIN 잠금을 켰어요');
  });

  ['pinA', 'pinB'].forEach((id) => {
    $(id).addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
  });

  $('lockNow').addEventListener('click', () => { lock(); });

  /* ───────── 기록자 · 부부 공유 ───────── */
  $('whoWife').addEventListener('click', () => { if (who !== 'wife') setWho('wife', { toast: true }); });
  $('whoHusband').addEventListener('click', () => { if (who !== 'husband') setWho('husband', { toast: true }); });

  $('sharePill').addEventListener('click', openShareSheet);
  $('shareCancel').addEventListener('click', closeShareSheet);
  $('shareSave').addEventListener('click', saveShareFromSheet);
  $('roomNew').addEventListener('click', () => {
    $('roomInput').value = randomRoom();
    showToast('새 부부 방 코드를 만들었어요');
  });
  $('roomInput').addEventListener('blur', () => {
    const v = normRoom($('roomInput').value);
    if (v !== $('roomInput').value) $('roomInput').value = v;
  });
  $('roomInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveShareFromSheet(); });
  $('shareSend').addEventListener('click', copyInviteLink);
  $('shareLeave').addEventListener('click', leaveShare);

  window.addEventListener('online', () => {
    if (!shared()) return;
    setMode('connecting');
    openStream();
    flush();
  });
  window.addEventListener('offline', () => {
    if (!shared()) return;
    setMode('offline');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!shared()) return;
    const stale = !net.lastEvent || Date.now() - net.lastEvent > 60000;
    if (net.mode === 'error' || net.mode === 'offline'
      || (net.mode === 'connecting' && !net.es && !net.pollTimer)
      || (net.mode === 'live' && stale)) {
      connectShare({ announce: false });
    } else {
      flush();
    }
  });

  /* ───────── 기타 ───────── */
  $('goCalendar').addEventListener('click', () => setView('calendar'));

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let toastTimer = null;
  let toastActionFn = null;

  function showToast(msg, actionLabel, fn, ms = 3600) {
    const toast = $('toast');
    $('toastMsg').textContent = msg;
    const action = $('toastAction');
    if (actionLabel) {
      action.hidden = false;
      action.textContent = actionLabel;
      toastActionFn = fn;
    } else {
      action.hidden = true;
      toastActionFn = null;
    }
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastActionFn = null;
    }, ms);
  }

  $('toastAction').addEventListener('click', () => {
    const fn = toastActionFn;
    $('toast').classList.remove('show');
    toastActionFn = null;
    if (fn) setTimeout(fn, 60);
  });

  /* ───────── PWA ───────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // sw.js 자체를 HTTP 캐시에서 읽지 않게 해서, 새 버전이 바로 적용되도록 한다
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update().catch(() => {}))
        .catch(() => {});
    });
  }

  /* ───────── 시작 ───────── */
  loadShare();
  setWho(who);
  pruneTombstones();
  renderAll();
  if (shared()) connectShare({ announce: false });
  if (state.settings.pinOn && state.settings.pin) lock();
  else syncModalLock();
})();
