#!/usr/bin/env python3
"""하트노트 Playwright 검증.

390px 아이폰 · 데스크톱 UI, 하트 기록/수정/삭제/되돌리기, 4종 평균 계산,
달력, PIN 잠금, 백업/복원, 콘솔 오류 0, 가로 넘침 0을 확인하고
스크린샷을 downloads/couple_love/ 에 저장한다.

    LD_LIBRARY_PATH=/workspace/tmp/libroot/usr/lib/x86_64-linux-gnu \
        python3 .dev/test_app.py
"""
import datetime
import json
import math
import os
import re
import sys
import tempfile
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

APP = 'http://127.0.0.1:8770/index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHOTS = '/workspace/downloads/couple_love'
os.makedirs(SHOTS, exist_ok=True)

TZ = ZoneInfo('Asia/Seoul')
TODAY = datetime.datetime.now(TZ).date()
WD = ['월', '화', '수', '목', '금', '토', '일']

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  · ' + str(detail)) if detail else ''), flush=True)


def key(d):
    return d.isoformat()


def shift(days):
    return TODAY - datetime.timedelta(days=days)


def new_page(browser, width=390, height=844, scale=2):
    ctx = browser.new_context(
        viewport={'width': width, 'height': height},
        device_scale_factor=scale,
        timezone_id='Asia/Seoul',
        locale='ko-KR',
        permissions=[],
    )
    page = ctx.new_page()
    errs = []
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('dialog', lambda d: d.accept())
    return ctx, page, errs


def overflow(page):
    return page.evaluate("""() => {
        const de = document.documentElement;
        const out = [];
        if (de.scrollWidth > window.innerWidth + 1) out.push('html ' + de.scrollWidth + '>' + window.innerWidth);
        document.querySelectorAll('body *').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
                const id = el.id ? '#' + el.id : (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : el.tagName);
                out.push(id + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
            }
        });
        return out.slice(0, 8);
    }""")


def shot(page, name, full=True):
    page.evaluate("() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }")
    handle = None
    if full:
        handle = page.add_style_tag(content=(
            '.tabbar{position:static !important;margin:22px auto 0 !important;border:1px solid #F4EAF0;'
            'border-left:1px solid #F4EAF0 !important;border-right:1px solid #F4EAF0 !important;'
            'border-radius:16px !important;}'
            '.app{padding-bottom:26px !important;}'
        ))
        page.wait_for_timeout(90)
    path = os.path.join(SHOTS, name)
    page.screenshot(path=path, full_page=full)
    if handle is not None:
        handle.evaluate("e => e.remove()")
        page.wait_for_timeout(60)
    return path


def seed(page, records, settings=None, mission=None):
    payload = {
        'version': 1,
        'records': records,
        'settings': settings or {},
        'mission': mission or {'date': '', 'idx': 0, 'done': False},
    }
    page.evaluate("(d) => localStorage.setItem('heartnote.v1', JSON.stringify(d))", payload)
    page.reload()
    page.wait_for_timeout(250)


def store(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('heartnote.v1') || '{}')")


def rec(date, time, mood='', memo='', rid=None):
    return {'id': rid or ('r' + date + time), 'date': date, 'time': time, 'mood': mood, 'memo': memo}


def avg_card_texts(page):
    return page.eval_on_selector_all(
        '#avgGrid .avg-card',
        "els => els.map(e => ({ key: e.dataset.window, "
        "count: e.querySelector('.avg-count').textContent.trim(), "
        "interval: e.querySelector('.avg-interval').textContent.trim() }))")


def expected_window(dates, days, floor=None):
    """기대값: 통계 기준일(floor)이 있으면 그날부터, 없으면 첫 기록부터 경과 일수를 센다."""
    start = TODAY - datetime.timedelta(days=days - 1)
    first = min(dates) if dates else None
    if floor:
        s = max(start, floor)
    else:
        s = max(start, first) if first else start
    count = sum(1 for d in dates if d >= s)
    covered = (TODAY - s).days + 1
    interval = None if count < 2 else covered / count
    return count, interval, covered


def want_range(covered, days):
    return f'{covered}일치' if covered < days else f'최근 {days}일'


def fmt_num(v):
    # 앱(Math.round)과 같이 0.5는 올림
    r = math.floor(v * 10 + 0.5) / 10
    return str(int(r)) if r == int(r) else f'{r:.1f}'


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ══════════ A. 빈 상태 · 레이아웃 ══════════
        ctx, page, errs = new_page(browser)
        page.goto(APP)
        page.wait_for_timeout(500)

        check('A1 페이지 로드 · 제목', page.title() == '하트노트 · 부부 사랑 기록', page.title())
        check('A2 브랜드 표시', '하트노트' in page.inner_text('.brand'))
        expected_head = f'{TODAY.month}월 {TODAY.day}일 {WD[TODAY.weekday()]}요일'
        check('A3 오늘 날짜 표시', page.inner_text('#headDate') == expected_head, page.inner_text('#headDate'))
        check('A4 빈 상태 문구', page.inner_text('#heroTitle') == '오늘은 아직 하트가 없어요', page.inner_text('#heroTitle'))
        check('A5 빈 상태 카운트 0', [page.inner_text('#chipToday'), page.inner_text('#chipMonth'), page.inner_text('#chipYear')] == ['0', '0', '0'])
        check('A6 최근 기록 빈 안내', '아직 기록이 없어요' in page.inner_text('#recentList'))
        check('A7 하단 탭 4개', page.eval_on_selector_all('.tab', 'els => els.length') == 4)
        check('A8 390px 가로 넘침 0', overflow(page) == [], overflow(page))
        check('A9 콘솔 오류 0', errs == [], errs)
        shot(page, '01-home-empty.png')

        # 탭 이동
        page.click('.tab[data-view="stats"]')
        page.wait_for_timeout(200)
        check('A10 통계 탭 전환', page.is_visible('#view-stats') and page.is_hidden('#view-home'))
        check('A11 통계 빈 상태 카드 4개', page.eval_on_selector_all('#avgGrid .avg-card', 'e => e.length') == 4)
        check('A12 통계 빈 간격 문구', all('이 기간 기록 없음' in c['interval'] for c in avg_card_texts(page)), avg_card_texts(page))
        check('A13 통계 가로 넘침 0', overflow(page) == [], overflow(page))
        shot(page, '02-stats-empty.png')

        page.click('.tab[data-view="calendar"]')
        page.wait_for_timeout(200)
        check('A14 달력 탭 · 이번 달', page.inner_text('#calMonth') == f'{TODAY.year}년 {TODAY.month}월', page.inner_text('#calMonth'))
        check('A15 달력 가로 넘침 0', overflow(page) == [], overflow(page))

        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(200)
        check('A16 설정 탭', page.is_visible('#view-settings'))
        check('A17 PIN 기본 꺼짐', page.get_attribute('#pinToggle', 'aria-checked') == 'false')
        check('A18 PIN 관련 행 숨김', page.is_hidden('#pinChangeRow') and page.is_hidden('#pinLockRow'))
        check('A19 설정 가로 넘침 0', overflow(page) == [], overflow(page))
        shot(page, '03-settings-empty.png')
        check('A20 오류 없음(탭 순회)', errs == [], errs)
        ctx.close()

        # ══════════ B. 하트 기록 · 메모 ══════════
        ctx, page, errs = new_page(browser)
        page.goto(APP)
        page.wait_for_timeout(400)

        page.click('#heartBtn')
        page.wait_for_timeout(350)
        s = store(page)
        check('B1 하트 누르면 오늘 기록', len(s['records']) == 1 and s['records'][0]['date'] == key(TODAY), s.get('records'))
        check('B2 시간이 자동 입력', re.match(r'^\d{2}:\d{2}$', s['records'][0]['time']) is not None, s['records'][0])
        check('B3 히어로 문구 변경', page.inner_text('#heroTitle') == '오늘 1번, 사랑을 남겼어요', page.inner_text('#heroTitle'))
        check('B4 오늘 칩 1', page.inner_text('#chipToday') == '1')
        check('B5 최근 기록 행 표시', page.eval_on_selector_all('#recentList .rec-row', 'e => e.length') == 1)
        check('B6 토스트 표시', page.is_visible('#toast') and '메모' in page.inner_text('#toastAction'), page.inner_text('#toast'))
        page.screenshot(path=os.path.join(SHOTS, '04-home-after-heart.png'), full_page=False)

        page.click('#toastAction')
        page.wait_for_timeout(300)
        check('B7 메모 남기기 시트 열림', page.is_visible('#recordSheet'))
        page.click('#recMoods .mood[data-mood="행복"]')
        page.fill('#recMemo', '오늘도 고마워')
        page.wait_for_timeout(80)
        check('B8 메모 글자 수', page.inner_text('#memoCount') == '7/60', page.inner_text('#memoCount'))
        shot(page, '05-record-sheet.png', full=False)
        page.click('#recSave')
        page.wait_for_timeout(300)
        s = store(page)
        check('B9 기분·메모 저장', s['records'][0]['mood'] == '행복' and s['records'][0]['memo'] == '오늘도 고마워', s['records'][0])
        check('B10 최근 기록에 메모 표시', '오늘도 고마워' in page.inner_text('#recentList'))
        check('B11 시트 닫힘', page.is_hidden('#recordSheet'))

        page.reload()
        page.wait_for_timeout(400)
        check('B12 새로고침 후 유지', page.inner_text('#chipToday') == '1' and '오늘도 고마워' in page.inner_text('#recentList'))

        page.click('#heartBtn')
        page.wait_for_timeout(250)
        check('B13 두 번째 하트 누적', page.inner_text('#chipToday') == '2' and len(store(page)['records']) == 2)
        check('B14 오늘 2번 문구', page.inner_text('#heroTitle') == '오늘 2번, 사랑을 남겼어요', page.inner_text('#heroTitle'))
        page.wait_for_timeout(700)
        check('B15 기록 애니메이션 요소 초기화', page.eval_on_selector('#heartBurst', 'e => e.children.length') == 0)
        check('B16 B단계 오류 0', errs == [], errs)

        # ══════════ C. 수정 · 삭제 · 되돌리기 ══════════
        ykey = key(shift(1))
        page.click('#recentList .rec-row >> nth=1')
        page.wait_for_timeout(300)
        check('C1 수정 시트 열림', page.inner_text('#recordTitle') == '기록 수정', page.inner_text('#recordTitle'))
        page.fill('#recDate', ykey)
        page.fill('#recTime', '21:05')
        page.click('#recMoods .mood[data-mood="설렘"]')
        page.fill('#recMemo', '어제의 하트')
        page.click('#recSave')
        page.wait_for_timeout(350)
        s = store(page)
        edited = [r for r in s['records'] if r['date'] == ykey]
        check('C2 날짜·시간·기분 수정', len(edited) == 1 and edited[0]['time'] == '21:05' and edited[0]['mood'] == '설렘', edited)
        check('C3 메모 수정', edited and edited[0]['memo'] == '어제의 하트', edited)
        check('C4 수정 후 오늘 칩 1', page.inner_text('#chipToday') == '1', page.inner_text('#chipToday'))

        # 어제 기록 열어 삭제
        page.click('#recentList .rec-row >> nth=1')
        page.wait_for_timeout(300)
        check('C5 어제 기록 열림', page.input_value('#recDate') == ykey, page.input_value('#recDate'))
        page.click('#recDelete')
        page.wait_for_timeout(350)
        check('C6 삭제 반영', len(store(page)['records']) == 1, store(page)['records'])
        check('C7 되돌리기 토스트', page.is_visible('#toast') and page.inner_text('#toastAction') == '되돌리기', page.inner_text('#toast'))
        page.click('#toastAction')
        page.wait_for_timeout(400)
        check('C8 되돌리기 복구', len(store(page)['records']) == 2 and any(r['date'] == ykey for r in store(page)['records']), store(page)['records'])
        check('C9 C단계 오류 0', errs == [], errs)
        ctx.close()

        # ══════════ D/E. 통계 · 달력 (데이터 시드) ══════════
        ctx, page, errs = new_page(browser)
        page.goto(APP)
        page.wait_for_timeout(300)

        seed_records = [
            rec(key(TODAY), '09:12', '행복', '오늘 아침'),
            rec(key(TODAY), '21:40', '설렘', '저녁 산책'),
            rec(key(shift(5)), '22:10', '행복', ''),
            rec(key(shift(20)), '20:30', '', ''),
            rec(key(shift(45)), '21:00', '고마움', '고마워'),
            rec(key(shift(100)), '22:00', '', ''),
            rec(key(shift(200)), '21:15', '', ''),
            rec(key(shift(300)), '20:45', '', ''),
        ]
        seed(page, seed_records, settings={'pinOn': False, 'pin': '', 'startDate': '2014-05-10', 'statsStartDate': '2026-01-01'})
        dates = [shift(d) for d in (0, 0, 5, 20, 45, 100, 200, 300)]
        floor = datetime.date(2026, 1, 1)

        check('D1 오늘 2번 문구', page.inner_text('#heroTitle') == '오늘 2번, 사랑을 남겼어요', page.inner_text('#heroTitle'))
        check('D2 함께한 지 표시', '일' in page.inner_text('#loveLine') and page.is_visible('#loveLine'), page.inner_text('#loveLine'))
        love_days = (TODAY - datetime.date(2014, 5, 10)).days + 1
        check('D3 함께한 날 계산', page.inner_text('#loveDays') == f'{love_days}일', page.inner_text('#loveDays'))
        check('D4 최근 4개만 표시', page.eval_on_selector_all('#recentList .rec-row', 'e => e.length') == 4)
        shot(page, '06-home-with-data.png')

        page.click('.tab[data-view="stats"]')
        page.wait_for_timeout(300)
        exp = {
            'month': expected_window(dates, 30, floor),
            'quarter': expected_window(dates, 90, floor),
            'half': expected_window(dates, 180, floor),
            'yearAvg': expected_window(dates, 365, floor),
        }
        cards = {c['key']: c for c in avg_card_texts(page)}
        for k in ('month', 'quarter', 'half', 'yearAvg'):
            count, interval, covered = exp[k]
            want_count = f'{count}회'
            want_interval = f'평균 {fmt_num(interval)}일마다' if interval else '2회부터 계산돼요'
            check(f'D5 {k} 횟수', cards[k]['count'] == want_count, f"{cards[k]['count']} vs {want_count}")
            check(f'D6 {k} 평균 간격', cards[k]['interval'] == want_interval, f"{cards[k]['interval']} vs {want_interval}")

        month_count = sum(1 for d in dates if d.year == TODAY.year and d.month == TODAY.month)
        year_count = sum(1 for d in dates if d.year == TODAY.year)
        check('D7 이번 달 누적', page.inner_text('#statMonth') == str(month_count), f"{page.inner_text('#statMonth')} vs {month_count}")
        check('D8 올해 누적', page.inner_text('#statYear') == str(year_count), f"{page.inner_text('#statYear')} vs {year_count}")

        chart_counts = []
        for i in range(5, -1, -1):
            m = (TODAY.replace(day=1) - datetime.timedelta(days=0))
            y, mo = TODAY.year, TODAY.month - i
            while mo < 1:
                mo += 12
                y -= 1
            chart_counts.append(sum(1 for d in dates if d.year == y and d.month == mo))
        check('D9 최근 6개월 합계', page.inner_text('#chartTotal') == f'{sum(chart_counts)}회', f"{page.inner_text('#chartTotal')} vs {sum(chart_counts)}")
        bars = page.eval_on_selector_all('#monthChart .chart-col', 'els => els.map(e => e.querySelector(".chart-label").textContent + ":" + e.querySelector(".chart-val").textContent)')
        check('D10 막대 6개', len(bars) == 6, bars)
        check('D11 막대 값 일치', [b.split(':')[1] for b in bars] == [str(c) if c else '' for c in chart_counts], f'{bars} vs {chart_counts}')
        check('D12 기분 태그 집계', page.inner_text('#moodTotal') == '태그 4개', page.inner_text('#moodTotal'))
        mood_txt = re.sub(r'\s+', ' ', page.eval_on_selector('#moodStats', 'e => e.textContent'))
        check('D13 기분별 숫자', '행복 2' in mood_txt and '설렘 1' in mood_txt and '고마움 1' in mood_txt, mood_txt)
        check('D14 통계 가로 넘침 0', overflow(page) == [], overflow(page))
        check('D15 통계 오류 0', errs == [], errs)
        check('D16 통계 기준일 안내', page.inner_text('#statsBase') == '통계 기준: 2026.01.01 ~', page.inner_text('#statsBase'))
        shot(page, '07-stats.png')

        # ══════════ E. 달력 ══════════
        page.click('.tab[data-view="calendar"]')
        page.wait_for_timeout(300)
        today_cell = page.query_selector(f'#calGrid .cal-cell[data-date="{key(TODAY)}"]')
        check('E1 오늘 칸 존재', today_cell is not None)
        check('E2 오늘 칸 하트', 'has-heart' in (today_cell.get_attribute('class') or ''))
        check('E3 오늘 칸 배지 2', today_cell.query_selector('.cal-count') is not None and today_cell.query_selector('.cal-count').inner_text() == '2')
        month_days = len({d for d in dates if d.year == TODAY.year and d.month == TODAY.month})
        month_hearts = sum(1 for d in dates if d.year == TODAY.year and d.month == TODAY.month)
        check('E4 이번 달 하트 있는 날', page.inner_text('#calSumDays') == f'{month_days}일', page.inner_text('#calSumDays'))
        check('E5 이번 달 하트 수', page.inner_text('#calSumHearts') == f'하트 {month_hearts}개', page.inner_text('#calSumHearts'))
        check('E6 이번 달 다음 버튼 막힘', page.get_attribute('#calNext', 'aria-disabled') == 'true')
        check('E7 달력 가로 넘침 0', overflow(page) == [], overflow(page))
        shot(page, '08-calendar.png')

        page.click(f'#calGrid .cal-cell[data-date="{key(TODAY)}"]')
        page.wait_for_timeout(300)
        check('E8 날짜 시트 열림', page.is_visible('#daySheet'))
        check('E9 날짜 제목', f'{TODAY.month}월 {TODAY.day}일' in page.inner_text('#dayTitle'), page.inner_text('#dayTitle'))
        check('E10 그날 기록 2개', page.eval_on_selector_all('#dayList .rec-row', 'e => e.length') == 2)
        shot(page, '09-day-sheet.png', full=False)
        page.click('#dayAdd')
        page.wait_for_timeout(300)
        check('E11 그 날짜로 추가 시트', page.is_visible('#recordSheet') and page.input_value('#recDate') == key(TODAY), page.input_value('#recDate'))
        page.fill('#recTime', '23:30')
        page.fill('#recMemo', '자정 전 마지막')
        page.click('#recSave')
        page.wait_for_timeout(350)
        check('E12 추가 기록 저장', any(r['memo'] == '자정 전 마지막' for r in store(page)['records']))
        check('E13 오늘 칸 배지 3', page.query_selector(f'#calGrid .cal-cell[data-date="{key(TODAY)}"] .cal-count').inner_text() == '3')

        # 날짜 시트에서 바로 삭제하면 목록도 갱신
        page.click(f'#calGrid .cal-cell[data-date="{key(TODAY)}"]')
        page.wait_for_timeout(300)
        page.click('#dayList .rec-row >> nth=0')
        page.wait_for_timeout(300)
        page.click('#recDelete')
        page.wait_for_timeout(450)
        check('E14 날짜 시트 목록 갱신', page.eval_on_selector_all('#dayList .rec-row', 'e => e.length') == 2, page.eval_on_selector_all('#dayList .rec-row', 'e => e.length'))
        check('E15 달력 배지 갱신', page.query_selector(f'#calGrid .cal-cell[data-date="{key(TODAY)}"] .cal-count').inner_text() == '2')
        page.click('#dayClose')
        page.wait_for_timeout(250)

        # 달 이동: 이전 달로 갔다가 다시 이번 달로
        prev_title = page.inner_text('#calMonth')
        page.click('#calPrev')
        page.wait_for_timeout(250)
        check('E16 이전 달 이동', page.inner_text('#calMonth') != prev_title, page.inner_text('#calMonth'))
        page.click('#calNext')
        page.wait_for_timeout(250)
        check('E17 이번 달 복귀', page.inner_text('#calMonth') == prev_title, page.inner_text('#calMonth'))
        check('E18 달력 마지막 오류 0', errs == [], errs)

        # ══════════ F. PIN 잠금 ══════════
        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(200)
        page.click('#pinToggle')
        page.wait_for_timeout(300)
        check('F1 PIN 설정 시트', page.is_visible('#pinSheet') and page.inner_text('#pinTitle') == 'PIN 번호 설정')
        page.fill('#pinA', '1234')
        page.fill('#pinB', '1234')
        page.click('#pinSave')
        page.wait_for_timeout(350)
        check('F2 PIN 켜짐', page.get_attribute('#pinToggle', 'aria-checked') == 'true')
        check('F3 변경/잠금 행 표시', page.is_visible('#pinChangeRow') and page.is_visible('#pinLockRow'))
        check('F4 PIN은 저장됨', store(page)['settings']['pin'] == '1234' and store(page)['settings']['pinOn'] is True)
        shot(page, '10-settings-pin.png')

        page.reload()
        page.wait_for_timeout(450)
        check('F5 새로고침 시 잠금', page.is_visible('#lockScreen'), page.is_visible('#lockScreen'))
        check('F6 잠금 중 앱 가림', page.get_attribute('#appRoot', 'aria-hidden') == 'true')
        shot(page, '11-pin-lock.png', full=False)
        for d in '0000':
            page.click(f'#lockKeypad button[data-key="{d}"]')
        page.wait_for_timeout(500)
        check('F7 틀린 PIN 안내', '맞지 않아요' in page.inner_text('#lockHint'), page.inner_text('#lockHint'))
        check('F8 틀린 뒤에도 잠김', page.is_visible('#lockScreen'))
        check('F9 입력 초기화', page.eval_on_selector_all('#lockDots i.on', 'e => e.length') == 0)
        for d in '1234':
            page.click(f'#lockKeypad button[data-key="{d}"]')
        page.wait_for_timeout(450)
        check('F10 맞는 PIN 해제', page.is_hidden('#lockScreen'))
        check('F11 앱 다시 보임', page.get_attribute('#appRoot', 'aria-hidden') is None)

        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(200)
        page.click('#lockNow')
        page.wait_for_timeout(250)
        check('F12 지금 잠그기', page.is_visible('#lockScreen'))
        for d in '1234':
            page.click(f'#lockKeypad button[data-key="{d}"]')
        page.wait_for_timeout(400)

        # PIN 변경
        page.click('#pinChange')
        page.wait_for_timeout(250)
        check('F13 변경 1단계', page.inner_text('#pinTitle') == 'PIN 번호 변경' and page.is_hidden('#pinRowB'))
        page.fill('#pinA', '1234')
        page.click('#pinSave')
        page.wait_for_timeout(250)
        check('F14 변경 2단계', page.inner_text('#pinTitle') == '새 PIN 번호' and page.is_visible('#pinRowB'), page.inner_text('#pinTitle'))
        page.fill('#pinA', '5678')
        page.fill('#pinB', '5678')
        page.click('#pinSave')
        page.wait_for_timeout(300)
        check('F15 새 PIN 저장', store(page)['settings']['pin'] == '5678')

        page.reload()
        page.wait_for_timeout(400)
        for d in '5678':
            page.click(f'#lockKeypad button[data-key="{d}"]')
        page.wait_for_timeout(400)
        check('F16 새 PIN 해제', page.is_hidden('#lockScreen'))

        # PIN 끄기
        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(200)
        page.click('#pinToggle')
        page.wait_for_timeout(250)
        check('F17 끄기 시트', page.inner_text('#pinTitle') == 'PIN 잠금 끄기')
        page.fill('#pinA', '5678')
        page.click('#pinSave')
        page.wait_for_timeout(300)
        check('F18 PIN 꺼짐', page.get_attribute('#pinToggle', 'aria-checked') == 'false' and store(page)['settings']['pin'] == '')
        page.reload()
        page.wait_for_timeout(400)
        check('F19 새로고침 후 잠금 없음', page.is_hidden('#lockScreen'))
        check('F20 F단계 오류 0', errs == [], errs)
        ctx.close()

        # ══════════ G. 백업 · 복원 ══════════
        ctx, page, errs = new_page(browser)
        page.goto(APP)
        page.wait_for_timeout(300)
        seed(page, [
            rec(key(TODAY), '21:00', '행복', '백업할 기록1'),
            rec(key(shift(3)), '20:00', '포근', '백업할 기록2'),
        ], settings={'startDate': '2015-03-02', 'statsStartDate': '2026-11-03'})
        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(200)

        with page.expect_download() as dl:
            page.click('#btnBackup')
        download = dl.value
        fname = download.suggested_filename
        check('G1 백업 파일 이름', fname.startswith('하트노트-백업-') and fname.endswith('.json'), fname)
        saved = os.path.join(tempfile.gettempdir(), 'heartnote_backup_test.json')
        download.save_as(saved)
        with open(saved, encoding='utf-8') as f:
            payload = json.load(f)
        check('G2 백업 내용 기록 2개', payload.get('app') == 'heartnote' and len(payload.get('records', [])) == 2, payload.keys())
        check('G3 백업에 PIN 없음', 'pin' not in json.dumps(payload.get('settings', {})), payload.get('settings'))
        check('G4 백업 시작일 포함', payload['settings'].get('startDate') == '2015-03-02', payload.get('settings'))
        check('G4b 백업 통계 기준일 포함', payload['settings'].get('statsStartDate') == '2026-11-03', payload.get('settings'))

        page.click('#btnReset')
        page.wait_for_timeout(350)
        check('G5 전체 삭제', store(page)['records'] == [], store(page)['records'])

        page.set_input_files('#fileInput', saved)
        page.wait_for_timeout(500)
        check('G6 복원 기록 수', len(store(page)['records']) == 2, store(page)['records'])
        check('G7 복원 시작일', store(page)['settings']['startDate'] == '2015-03-02', store(page).get('settings'))
        check('G7b 복원 통계 기준일', store(page)['settings']['statsStartDate'] == '2026-11-03', store(page).get('settings'))
        check('G8 복원 안내 토스트', '복원' in page.inner_text('#toast'), page.inner_text('#toast'))

        # 잘못된 파일
        bad = os.path.join(tempfile.gettempdir(), 'heartnote_bad.json')
        with open(bad, 'w', encoding='utf-8') as f:
            f.write('{"hello": "world"}')
        page.set_input_files('#fileInput', bad)
        page.wait_for_timeout(350)
        check('G9 잘못된 파일 거부', len(store(page)['records']) == 2 and '백업 파일이 아니에요' in page.inner_text('#toast'), page.inner_text('#toast'))
        check('G10 G단계 오류 0', errs == [], errs)
        ctx.close()

        # ══════════ M. 통계 기준 시작일 (기본 2026-11-01) ══════════
        BASE = datetime.date(2026, 11, 1)
        base_days = (TODAY - BASE).days + 1
        ctx, page, errs = new_page(browser)
        page.goto(APP)
        page.wait_for_timeout(400)

        s = store(page)
        check('M1 기본 통계 기준일 저장', s['settings'].get('statsStartDate') == '2026-11-01', s.get('settings'))
        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(250)
        check('M2 설정 입력값', page.input_value('#statsStartDate') == '2026-11-01', page.input_value('#statsStartDate'))
        check('M3 설정 안내 문구', '2026.11.01' in page.inner_text('#statsStartNote'), page.inner_text('#statsStartNote'))

        old = datetime.date(2026, 10, 20)
        seed(page, [
            rec(key(old), '21:00', '행복', '기준일 이전'),
            rec('2026-11-05', '20:00', '행복', ''),
            rec('2026-11-12', '21:10', '포근', ''),
            rec(key(shift(2)), '22:00', '행복', ''),
            rec(key(TODAY), '09:00', '설렘', ''),
        ], settings={'statsStartDate': '2026-11-01'})
        all_dates = [old, datetime.date(2026, 11, 5), datetime.date(2026, 11, 12), shift(2), TODAY]
        in_base = sorted(d for d in all_dates if BASE <= d <= TODAY)

        page.click('.tab[data-view="stats"]')
        page.wait_for_timeout(300)
        check('M4 통계 기준 안내', page.inner_text('#statsBase') == '통계 기준: 2026.11.01 ~', page.inner_text('#statsBase'))
        month_in_base = sum(1 for d in in_base if d.year == TODAY.year and d.month == TODAY.month)
        check('M5 이번 달은 기준일 이후만', page.inner_text('#statMonth') == str(month_in_base), f"{page.inner_text('#statMonth')} vs {month_in_base}")
        year_in_base = sum(1 for d in in_base if d.year == TODAY.year)
        check('M6 올해는 기준일 이후만', page.inner_text('#statYear') == str(year_in_base), f"{page.inner_text('#statYear')} vs {year_in_base}")

        cards = {c['key']: c for c in avg_card_texts(page)}
        for k, days in (('month', 30), ('quarter', 90), ('half', 180), ('yearAvg', 365)):
            count, interval, covered = expected_window(in_base, days, BASE)
            want_count = f'{count}회'
            want_interval = f'평균 {fmt_num(interval)}일마다' if interval else '2회부터 계산돼요'
            check(f'M7 {k} 기준일 이후 횟수', cards[k]['count'] == want_count, f"{cards[k]['count']} vs {want_count}")
            check(f'M8 {k} 평균 간격(경과 일수)', cards[k]['interval'] == want_interval, f"{cards[k]['interval']} vs {want_interval}")
        ranges = page.eval_on_selector_all('#avgGrid .avg-range', 'els => els.map(e => e.textContent.trim())')
        want_ranges = []
        for days in (30, 90, 180, 365):
            _, _, covered = expected_window(in_base, days, BASE)
            want_ranges.append(want_range(covered, days))
        check('M9 기간 표시(일수)', ranges == want_ranges, f'{ranges} vs {want_ranges}')
        mood_txt = re.sub(r'\s+', ' ', page.eval_on_selector('#moodStats', 'e => e.textContent'))
        check('M10 기분 집계도 기준일 이후만', '행복 2' in mood_txt and '포근 1' in mood_txt and '설렘 1' in mood_txt, mood_txt)
        check('M10b 기준일 이전 기록은 보관', len(store(page)['records']) == 5 and any(r['memo'] == '기준일 이전' for r in store(page)['records']), store(page)['records'])
        check('M11 통계 넘침 0', overflow(page) == [], overflow(page))
        shot(page, '15-stats-nov1.png')

        # 기준일 변경
        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(200)
        page.fill('#statsStartDate', '2026-11-10')
        page.wait_for_timeout(300)
        check('M12 기준일 변경 저장', store(page)['settings'].get('statsStartDate') == '2026-11-10', store(page).get('settings'))
        page.click('.tab[data-view="stats"]')
        page.wait_for_timeout(300)
        check('M13 안내 문구 갱신', page.inner_text('#statsBase') == '통계 기준: 2026.11.10 ~', page.inner_text('#statsBase'))
        changed = sorted(d for d in all_dates if datetime.date(2026, 11, 10) <= d <= TODAY)
        check('M14 변경 후 이번 달 집계', page.inner_text('#statMonth') == str(sum(1 for d in changed if d.year == TODAY.year and d.month == TODAY.month)), page.inner_text('#statMonth'))

        # 기준일 비우면 전체 기록
        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(200)
        page.click('#statsStartDate')
        page.press('#statsStartDate', 'Control+a')
        page.press('#statsStartDate', 'Backspace')
        page.press('#statsStartDate', 'Tab')
        page.wait_for_timeout(300)
        check('M15 기준일 비움 저장', store(page)['settings'].get('statsStartDate') == '', store(page).get('settings'))
        check('M15a 비움 안내 문구', '모든 기록' in page.inner_text('#statsStartNote'), page.inner_text('#statsStartNote'))
        page.click('.tab[data-view="stats"]')
        page.wait_for_timeout(300)
        check('M15b 전체 기록 기준', page.inner_text('#statsBase') == '통계 기준: 전체 기록 ~', page.inner_text('#statsBase'))
        all_year = sum(1 for d in all_dates if d.year == TODAY.year and d <= TODAY)
        check('M15c 기준일 이전도 집계', page.inner_text('#statYear') == str(all_year), f"{page.inner_text('#statYear')} vs {all_year}")

        # 기본값 복귀
        page.click('.tab[data-view="settings"]')
        page.wait_for_timeout(200)
        page.click('#statsStartReset')
        page.wait_for_timeout(300)
        check('M16 기본값 버튼', store(page)['settings'].get('statsStartDate') == '2026-11-01' and page.input_value('#statsStartDate') == '2026-11-01', page.input_value('#statsStartDate'))

        page.reload()
        page.wait_for_timeout(450)
        check('M17 새로고침 후 유지', store(page)['settings'].get('statsStartDate') == '2026-11-01', store(page).get('settings'))
        page.click('.tab[data-view="stats"]')
        page.wait_for_timeout(250)
        check('M18 새로고침 후 통계 기준', page.inner_text('#statsBase') == '통계 기준: 2026.11.01 ~', page.inner_text('#statsBase'))
        check('M19 M단계 오류 0', errs == [], errs)
        ctx.close()

        # ══════════ H. 미션 ══════════
        ctx, page, errs = new_page(browser)
        page.goto(APP)
        page.wait_for_timeout(300)
        first_mission = page.inner_text('#missionText')
        check('H1 미션 표시', len(first_mission) > 2, first_mission)
        page.click('#missionShuffle')
        page.wait_for_timeout(200)
        check('H2 다른 미션으로 변경', page.inner_text('#missionText') != first_mission, page.inner_text('#missionText'))
        page.click('#missionDone')
        page.wait_for_timeout(200)
        check('H3 했어요 체크', page.get_attribute('#missionDone', 'aria-pressed') == 'true')
        page.reload()
        page.wait_for_timeout(350)
        check('H4 미션 상태 유지', page.get_attribute('#missionDone', 'aria-pressed') == 'true' and page.inner_text('#missionText') != first_mission)
        check('H5 미션 오류 0', errs == [], errs)
        ctx.close()

        # ══════════ I. PWA ══════════
        ctx, page, errs = new_page(browser)
        page.goto(APP)
        page.wait_for_timeout(1800)
        man = page.evaluate("""async () => {
            const r = await fetch('./manifest.webmanifest');
            const j = await r.json();
            return [r.status, j.name, j.display, (j.icons || []).length];
        }""")
        check('I1 manifest 200', man[0] == 200, man)
        check('I2 manifest 이름', man[1] == '하트노트 · 부부 사랑 기록', man[1])
        check('I3 standalone', man[2] == 'standalone')
        check('I4 아이콘 3종', man[3] == 3, man[3])
        icons = page.evaluate("""async () => {
            const out = [];
            for (const p of ['./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png','./icon.svg']) {
                const r = await fetch(p);
                out.push(p + ':' + r.status);
            }
            return out;
        }""")
        check('I5 아이콘 모두 200', all(x.endswith(':200') for x in icons), icons)
        sw = page.evaluate("""async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            return !!reg;
        }""")
        check('I6 서비스워커 등록', sw is True, sw)
        ctx.close()

        # ══════════ J. 데스크톱 · 작은 화면 ══════════
        ctx, page, errs = new_page(browser, width=1280, height=900, scale=1)
        page.goto(APP)
        page.wait_for_timeout(400)
        box = page.eval_on_selector('.app', 'e => { const r = e.getBoundingClientRect(); return {w: Math.round(r.width), l: Math.round(r.left)}; }')
        check('J1 데스크톱 앱 폭 480', box['w'] == 480, box)
        check('J2 데스크톱 가운데 정렬', abs(box['l'] - 400) <= 2, box)
        check('J3 데스크톱 넘침 0', overflow(page) == [], overflow(page))
        shot(page, '12-desktop-home.png')
        page.click('.tab[data-view="stats"]')
        page.wait_for_timeout(250)
        check('J4 데스크톱 통계 넘침 0', overflow(page) == [], overflow(page))
        shot(page, '13-desktop-stats.png')
        check('J5 데스크톱 오류 0', errs == [], errs)
        ctx.close()

        ctx, page, errs = new_page(browser, width=360, height=780, scale=2)
        page.goto(APP)
        page.wait_for_timeout(400)
        check('K1 360px 넘침 0', overflow(page) == [], overflow(page))
        page.click('#heartBtn')
        page.wait_for_timeout(300)
        check('K2 360px 기록 후 넘침 0', overflow(page) == [], overflow(page))
        shot(page, '14-mobile-360.png', full=False)
        check('K3 360px 오류 0', errs == [], errs)
        ctx.close()

        # ══════════ L. 잠금 상태에서 백업 복원으로 풀기 ══════════
        ctx, page, errs = new_page(browser)
        page.goto(APP)
        page.wait_for_timeout(300)
        seed(page, [
            rec(key(TODAY), '21:00', '행복', '잠금 전 기록'),
            rec(key(shift(2)), '20:00', '', ''),
        ], settings={'pinOn': True, 'pin': '1234', 'startDate': ''})
        check('L1 잠금 화면', page.is_visible('#lockScreen'))

        recovery = os.path.join(tempfile.gettempdir(), 'heartnote_recovery.json')
        with open(recovery, 'w', encoding='utf-8') as f:
            json.dump({'app': 'heartnote', 'version': 1, 'settings': {'startDate': ''},
                       'records': [rec(key(shift(7)), '22:30', '포근', '복원된 기록')]}, f, ensure_ascii=False)

        page.click('#lockForgot')
        page.wait_for_timeout(250)
        check('L2 PIN 분실 안내', page.is_visible('#forgotSheet'))
        with page.expect_file_chooser() as fc:
            page.click('#forgotRestore')
        fc.value.set_files(recovery)
        page.wait_for_timeout(600)
        check('L3 복원으로 잠금 해제', page.is_hidden('#lockScreen'))
        check('L4 복원 기록 적용', len(store(page)['records']) == 1 and store(page)['records'][0]['memo'] == '복원된 기록', store(page)['records'])
        check('L5 PIN 꺼짐', store(page)['settings']['pinOn'] is False and store(page)['settings']['pin'] == '')
        check('L6 잠금 복구 오류 0', errs == [], errs)
        ctx.close()

        browser.close()

    # ── 결과 ──
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f'\n{passed}/{total} 통과')
    if passed != total:
        print('실패 목록:')
        for name, ok, detail in results:
            if not ok:
                print(' -', name, '·', detail)
        sys.exit(1)


if __name__ == '__main__':
    main()
