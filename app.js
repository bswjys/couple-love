/* 하트노트 · 부부 사랑 기록
 * 기기 안(localStorage)에만 저장하는 조용한 사랑 노트. */
(() => {
  'use strict';

  const STORE_KEY = 'heartnote.v1';
  const MOODS = ['설렘', '포근', '행복', '고마움'];
  const MOOD_EMOJI = { 설렘: '💓', 포근: '🧸', 행복: '😊', 고마움: '🙏' };
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
    settings: { pinOn: false, pin: '', startDate: '' },
    mission: { date: '', idx: 0, done: false },
  });

  function normalizeRecord(r) {
    if (!r || !isDateKey(r.date)) return null;
    const mood = MOODS.includes(r.mood) ? r.mood : '';
    return {
      id: typeof r.id === 'string' && r.id ? r.id : 'r' + Math.random().toString(36).slice(2, 9),
      date: r.date,
      time: isTimeKey(r.time) ? r.time : '12:00',
      mood,
      memo: typeof r.memo === 'string' ? r.memo.slice(0, 60) : '',
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
        if (!s.settings.pin) s.settings.pinOn = false;
      }
      if (parsed.mission && typeof parsed.mission === 'object') {
        s.mission = {
          date: typeof parsed.mission.date === 'string' ? parsed.mission.date : '',
          idx: Number.isInteger(parsed.mission.idx) ? parsed.mission.idx : 0,
          done: parsed.mission.done === true,
        };
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

  /* ───────── 통계 ───────── */
  function computeStats() {
    const today = startOfDay();
    const all = state.records
      .map((r) => ({ ...r, d: parseKey(r.date) }))
      .filter((r) => r.d <= today)
      .sort((a, b) => (a.d - b.d) || a.time.localeCompare(b.time));

    const first = all.length ? all[0].d : null;
    const windows = {};
    WINDOWS.forEach((w) => {
      const winStart = new Date(today);
      winStart.setDate(winStart.getDate() - (w.days - 1));
      const start = first && first > winStart ? first : winStart;
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

    return { all, windows, monthCount, yearCount, todayCount, months, moodCounts, tagged, total: all.length };
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

    $('avgGrid').innerHTML = WINDOWS.map((w) => {
      const a = st.windows[w.key];
      let intervalText;
      let empty = false;
      if (a.count === 0) { intervalText = '이 기간 기록 없음'; empty = true; }
      else if (a.interval == null) { intervalText = '2회부터 계산돼요'; empty = true; }
      else { intervalText = `평균 ${fmtNum(a.interval)}일마다`; }
      return `
        <div class="avg-card" data-window="${w.key}">
          <div class="avg-head"><span class="avg-label">${w.label}</span><span class="avg-range">${w.range}</span></div>
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
  }

  function renderAll() {
    renderHeader();
    renderHome();
    renderStats();
    renderCalendar();
    renderSettings();
    refreshDaySheet();
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

  function openSheet(el, focusEl) {
    lastFocus = document.activeElement;
    sheetZ += 1;
    el.style.zIndex = String(sheetZ);
    el.hidden = false;
    document.body.classList.add('modal-open');
    if (focusEl) setTimeout(() => { try { focusEl.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }, 60);
  }

  function closeSheet(el) {
    el.hidden = true;
    const anyOpen = Array.from(document.querySelectorAll('.sheet-backdrop')).some((s) => !s.hidden);
    if (!anyOpen) {
      sheetZ = 110;
      if ($('lockScreen').hidden) document.body.classList.remove('modal-open');
    }
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
    };
    state.records.unshift(rec);
    sortRecords(state.records);
    save();
    renderAll();
    if (onDone) onDone(rec);
    return rec;
  }

  function deleteRecord(id) {
    const idx = state.records.findIndex((r) => r.id === id);
    if (idx < 0) return;
    lastDeleted = state.records.splice(idx, 1)[0];
    save();
    renderAll();
    showToast('기록을 지웠어요', '되돌리기', () => {
      if (!lastDeleted) return;
      state.records.push(lastDeleted);
      lastDeleted = null;
      sortRecords(state.records);
      save();
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
        sortRecords(state.records);
        save();
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
    const rec = addRecord({ date: todayKey(), time: nowTime() });
    showToast('오늘의 하트를 남겼어요', '메모 남기기', () => openRecordSheet(rec), 5000);
  });

  /* ───────── 미션 ───────── */
  function ensureMission() {
    const t = todayKey();
    if (state.mission.date !== t) {
      state.mission = { date: t, idx: Math.floor(Math.random() * MISSIONS.length), done: false };
      save();
    }
  }

  $('missionShuffle').addEventListener('click', () => {
    const cur = state.mission.idx;
    let next = cur;
    while (next === cur && MISSIONS.length > 1) next = Math.floor(Math.random() * MISSIONS.length);
    state.mission.idx = next;
    state.mission.done = false;
    state.mission.date = todayKey();
    save();
    renderMission();
  });

  $('missionDone').addEventListener('click', () => {
    state.mission.done = !state.mission.done;
    save();
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
      settings: { startDate: state.settings.startDate },
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
    state.records = cleaned;
    if (parsed && parsed.settings && isDateKey(parsed.settings.startDate)) {
      state.settings.startDate = parsed.settings.startDate;
    }
    // 백업에는 PIN이 담기지 않으므로 복원 후 잠금은 꺼 둔다 (PIN 분실 복구 경로)
    state.settings.pinOn = false;
    state.settings.pin = '';
    save();
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
    state.records = [];
    state.mission.done = false;
    save();
    renderAll();
    showToast('모든 기록을 지웠어요');
  });

  /* ───────── 설정: 시작일 ───────── */
  $('startDate').addEventListener('change', () => {
    const v = $('startDate').value;
    if (v && v > todayKey()) { showToast('오늘 이전 날짜로 정해 주세요'); $('startDate').value = state.settings.startDate || ''; return; }
    state.settings.startDate = v || '';
    save();
    renderSettings();
    renderHome();
    if (v) showToast('함께한 날을 세어 드릴게요');
  });

  $('startClear').addEventListener('click', () => {
    state.settings.startDate = '';
    $('startDate').value = '';
    save();
    renderSettings();
    renderHome();
    showToast('시작일을 지웠어요');
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
    document.body.classList.add('modal-open');
  }

  function unlock() {
    $('lockScreen').hidden = true;
    $('appRoot').removeAttribute('aria-hidden');
    $('appRoot').inert = false;
    const anySheet = Array.from(document.querySelectorAll('.sheet-backdrop')).some((s) => !s.hidden);
    if (!anySheet) document.body.classList.remove('modal-open');
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
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  /* ───────── 시작 ───────── */
  renderAll();
  if (state.settings.pinOn && state.settings.pin) lock();
  else document.body.classList.remove('modal-open');
})();
