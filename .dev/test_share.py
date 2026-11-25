#!/usr/bin/env python3
"""하트노트 부부 공유(실시간 동기화) Playwright 검증 — 로컬 + 가짜 Firebase.

확인 항목
  · 상단 기록자(아내/남편) 선택과 저장
  · 부부 공유 켜기/중 버튼, 공유 시트(방 코드·초대 링크·공유 끄기)
  · 두 기기 양방향 동기화(하트·수정·삭제·기록자 배지)
  · 함께한 첫날 · 오늘의 사랑 표현 동기화
  · PIN 미동기화(서버·상대 폰에 남지 않음)
  · 오프라인 로컬 우선 저장 후 재연결 동기화
  · 한글 방 코드 · 390/320px 가로 넘침 0 · 콘솔 오류 0
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.request
from urllib.parse import quote
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

APP = 'http://127.0.0.1:8770/index.html'
MOCK = 'http://127.0.0.1:8775'
SHOTS = '/workspace/downloads/couple_love'
os.makedirs(SHOTS, exist_ok=True)

TZ = ZoneInfo('Asia/Seoul')
TODAY = datetime.datetime.now(TZ).date()

ROOM_INPUT = '우리 집'
ROOM = '우리집'
ROOM_ENC = quote(ROOM, safe='')

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  · ' + str(detail)) if detail else ''), flush=True)


def api(method, path, body=None):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(MOCK + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as r:
        txt = r.read().decode()
    return json.loads(txt) if txt else None


def room_data():
    return api('GET', f'/couple_rooms/{ROOM_ENC}.json')


def records():
    d = room_data() or {}
    return d.get('records') or {}


def open_ctx(browser, width=390, height=844, share_url=None):
    ctx = browser.new_context(
        viewport={'width': width, 'height': height},
        device_scale_factor=2,
        timezone_id='Asia/Seoul',
        locale='ko-KR',
        permissions=['clipboard-read', 'clipboard-write'],
    )
    if share_url:
        ctx.add_init_script(
            "if(!localStorage.getItem('heartnote.share.v1'))"
            "localStorage.setItem('heartnote.share.v1', JSON.stringify(%s));"
            % json.dumps({'url': share_url, 'room': ''}))
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


def store(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('heartnote.v1') || '{}')")


def pill(page):
    return page.inner_text('#sharePill').replace('\n', ' ').strip()


def rows(page):
    return page.evaluate("""() => Array.from(document.querySelectorAll('#recentList .rec-row')).map(r => ({
        by: r.querySelector('.rec-by') ? r.querySelector('.rec-by').textContent.trim() : null,
        memo: r.querySelector('.rec-memo') ? r.querySelector('.rec-memo').textContent.trim() : '' }))""")


def start_days():
    return (TODAY - datetime.date(2014, 5, 10)).days + 1


def wait_live(page, timeout=20000):
    page.wait_for_function("document.getElementById('sharePill').dataset.mode === 'live'", timeout=timeout)


def main():
    api('GET', '/__reset')
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ══════════ A. 상단 버튼 · 기록자 ══════════
        ctxA, A, errsA = open_ctx(browser)
        A.goto(APP)
        A.wait_for_timeout(500)

        check('A1 기본 공유 버튼', pill(A) == '부부 공유 켜기', pill(A))
        check('A2 기본 모드 local', A.get_attribute('#sharePill', 'data-mode') == 'local')
        check('A3 방 코드 칩 숨김', A.is_hidden('#shareRoom'))
        check('A4 기본 기록자 아내', A.get_attribute('#whoWife', 'aria-pressed') == 'true'
              and A.get_attribute('#whoHusband', 'aria-pressed') == 'false')
        A.click('#whoHusband')
        A.wait_for_timeout(200)
        check('A5 남편 선택', A.get_attribute('#whoHusband', 'aria-pressed') == 'true')
        check('A6 기록자 저장', A.evaluate("() => localStorage.getItem('heartnote.who.v1')") == 'husband')
        A.reload()
        A.wait_for_timeout(500)
        check('A7 새로고침 후 남편 유지', A.get_attribute('#whoHusband', 'aria-pressed') == 'true')
        A.click('#whoWife')
        A.wait_for_timeout(200)

        # 하트 2개 (아내)
        A.click('#heartBtn')
        A.wait_for_timeout(250)
        A.click('#heartBtn')
        A.wait_for_timeout(300)
        check('A8 로컬 하트 2개', len(store(A)['records']) == 2, len(store(A)['records']))
        check('A9 390px 넘침 0', overflow(A) == [], overflow(A))
        check('A10 A단계 오류 0', errsA == [], errsA)
        A.screenshot(path=os.path.join(SHOTS, 'share-01-home-390.png'), full_page=False)

        # ══════════ B. 공유 시트 · 연결 ══════════
        A.click('#sharePill')
        A.wait_for_timeout(300)
        check('B1 공유 시트 열림', A.is_visible('#shareSheet'))
        check('B2 시트 상태 문구', '부부 공유 꺼짐' in A.inner_text('#shareStatusText'), A.inner_text('#shareStatusText'))
        A.fill('#roomInput', 'A')
        A.click('#shareSave')
        A.wait_for_timeout(350)
        check('B3 짧은 방 코드 거부', '2~12자' in A.inner_text('#toast'), A.inner_text('#toast'))
        check('B4 거부 후에도 시트 열림', A.is_visible('#shareSheet'))

        A.fill('#roomInput', ROOM_INPUT)
        A.click('#advBox summary')
        A.wait_for_timeout(150)
        A.fill('#dbInput', MOCK)
        A.screenshot(path=os.path.join(SHOTS, 'share-02-sheet.png'), full_page=False)
        A.click('#shareSave')
        wait_live(A)
        A.wait_for_timeout(600)
        check('B5 한글 방 코드 연결', '부부 공유 중' in pill(A), pill(A))
        check('B6 방 코드 칩 표시', A.inner_text('#shareRoom') == ROOM, A.inner_text('#shareRoom'))
        check('B7 공백 제거 정규화', '우리집' in A.get_attribute('#sharePill', 'aria-label'), A.get_attribute('#sharePill', 'aria-label'))
        check('B8 시트 닫힘', A.is_hidden('#shareSheet'))
        check('B9 서버에 기록 2개', len(records()) == 2, list(records().values()))
        check('B10 서버 기록에 기록자', {v.get('by') for v in records().values()} == {'wife'}, [v.get('by') for v in records().values()])
        check('B11 홈 안내 문구', '두 사람이 함께' in A.inner_text('#homeFootNote'), A.inner_text('#homeFootNote'))
        A.screenshot(path=os.path.join(SHOTS, 'share-03-connected-390.png'), full_page=False)

        A.click('#sharePill')
        A.wait_for_timeout(300)
        check('B12 초대 링크 버튼', A.is_visible('#shareSend'))
        A.click('#shareSend')
        A.wait_for_timeout(500)
        clip = A.evaluate("() => navigator.clipboard.readText()")
        check('B13 초대 링크 복사', ('?room=' + ROOM_ENC) in clip and '우리집' in clip, clip)
        check('B14 복사 토스트', '복사' in A.inner_text('#toast'), A.inner_text('#toast'))
        A.click('#shareCancel')
        A.wait_for_timeout(200)

        # ══════════ C. 두 번째 폰 · 양방향 ══════════
        ctxB, B, errsB = open_ctx(browser, share_url=MOCK)
        B.goto(APP + '?room=' + ROOM_ENC)
        B.wait_for_timeout(500)
        wait_live(B)
        check('C1 초대 링크로 자동 연결', '부부 공유 중' in pill(B), pill(B))
        B.wait_for_function("document.querySelectorAll('#recentList .rec-row').length === 2", timeout=15000)
        check('C2 기존 하트 수신', len(rows(B)) == 2, rows(B))
        check('C3 기록자 배지 아내', all(r['by'] == '👩 아내' for r in rows(B)), rows(B))

        # A → B
        A.click('#heartBtn')
        t0 = time.time()
        B.wait_for_function("document.querySelectorAll('#recentList .rec-row').length === 3", timeout=8000)
        dt = time.time() - t0
        check('C4 A 하트가 B에 2초 내', dt < 2.0, f'{dt:.2f}s')

        # B → A (남편)
        B.click('#whoHusband')
        B.wait_for_timeout(150)
        B.click('#heartBtn')
        t0 = time.time()
        A.wait_for_function("document.querySelectorAll('#recentList .rec-row').length === 4", timeout=8000)
        dt = time.time() - t0
        check('C5 B 하트가 A에 2초 내', dt < 2.0, f'{dt:.2f}s')
        check('C6 남편 배지 수신', '👨 남편' in [r['by'] for r in rows(A)], rows(A))
        check('C7 서버 기록자 2종', {v.get('by') for v in records().values()} == {'wife', 'husband'}, [v.get('by') for v in records().values()])

        # A 수정 → B 반영
        A.click('#recentList .rec-row >> nth=0')
        A.wait_for_timeout(300)
        A.fill('#recMemo', '고마워 한마디')
        A.click('#recSave')
        B.wait_for_function("() => document.querySelector('#recentList').textContent.includes('고마워 한마디')", timeout=8000)
        check('C8 메모 수정 동기화', True)

        # A 삭제 → B 반영
        A.click('#recentList .rec-row >> nth=0')
        A.wait_for_timeout(300)
        A.click('#recDelete')
        A.wait_for_timeout(200)
        B.wait_for_function("document.querySelectorAll('#recentList .rec-row').length === 3", timeout=8000)
        check('C9 삭제 동기화', len(rows(B)) == 3, rows(B))
        check('C10 서버도 삭제 표시', any(v.get('deleted') for v in records().values()), list(records().values())[:2])

        # 되돌리기 → 양쪽 복구
        A.click('#toastAction')
        A.wait_for_timeout(400)
        B.wait_for_function("document.querySelectorAll('#recentList .rec-row').length === 4", timeout=8000)
        check('C11 되돌리기 동기화', len(rows(B)) == 4, rows(B))

        B.set_viewport_size({'width': 320, 'height': 700})
        B.wait_for_timeout(400)
        check('C12 320px 연결 상태 넘침 0', overflow(B) == [], overflow(B))
        B.screenshot(path=os.path.join(SHOTS, 'share-05-320.png'), full_page=False)
        B.set_viewport_size({'width': 390, 'height': 844})
        B.wait_for_timeout(300)
        B.screenshot(path=os.path.join(SHOTS, 'share-04-two-devices.png'), full_page=False)
        check('C13 C단계 오류 0', errsA == [] and errsB == [], errsA + errsB)

        # ══════════ D. 함께한 첫날 · 오늘의 사랑 표현 ══════════
        A.click('.tab[data-view="settings"]')
        A.wait_for_timeout(250)
        A.fill('#startDate', '2014-05-10')
        A.wait_for_timeout(300)
        try:
            B.wait_for_function("() => JSON.parse(localStorage.getItem('heartnote.v1')).settings.startDate === '2014-05-10'", timeout=8000)
            check('D1 시작일 동기화', True)
        except Exception as e:  # noqa: BLE001
            check('D1 시작일 동기화', False, str(e)[:120])
        B.click('.tab[data-view="settings"]')
        B.wait_for_timeout(300)
        check('D1b 시작일 입력값', B.input_value('#startDate') == '2014-05-10', B.input_value('#startDate'))

        # 통계 기준 시작일(기본 2026-11-01)도 두 사람 폰에 함께
        A.fill('#statsStartDate', '2010-01-01')
        A.wait_for_timeout(300)
        try:
            B.wait_for_function("() => JSON.parse(localStorage.getItem('heartnote.v1')).settings.statsStartDate === '2010-01-01'", timeout=8000)
            check('D1c 통계 기준일 동기화', True)
        except Exception as e:  # noqa: BLE001
            check('D1c 통계 기준일 동기화', False, str(e)[:120])
        B.click('.tab[data-view="settings"]')
        B.wait_for_timeout(300)
        check('D1d 통계 기준일 입력값', B.input_value('#statsStartDate') == '2010-01-01', B.input_value('#statsStartDate'))
        B.click('.tab[data-view="stats"]')
        B.wait_for_timeout(300)
        check('D1e B 통계 기준 안내', B.inner_text('#statsBase') == '통계 기준: 2010.01.01 ~', B.inner_text('#statsBase'))
        B.click('.tab[data-view="home"]')
        B.wait_for_timeout(300)
        check('D2 함께한 지 표시', B.is_visible('#loveLine') and B.inner_text('#loveDays') == f'{start_days()}일', B.inner_text('#loveDays'))

        A.click('.tab[data-view="home"]')
        A.wait_for_timeout(300)
        mission_a = A.inner_text('#missionText')
        check('D3 같은 미션', B.inner_text('#missionText') == mission_a, f'{mission_a} / {B.inner_text("#missionText")}')

        A.click('.tab[data-view="home"]')
        A.wait_for_timeout(200)
        A.click('#missionDone')
        B.wait_for_function("document.getElementById('missionDone').getAttribute('aria-pressed') === 'true'", timeout=8000)
        check('D4 완료 상태 동기화', True)

        A.click('#missionShuffle')
        A.wait_for_timeout(200)
        new_mission = A.inner_text('#missionText')
        B.wait_for_function("(m) => document.getElementById('missionText').textContent === m", arg=new_mission, timeout=8000)
        check('D5 미션 변경 동기화', B.inner_text('#missionText') == new_mission, new_mission)
        check('D6 D단계 오류 0', errsA == [] and errsB == [], errsA + errsB)

        # ══════════ E. PIN 미동기화 ══════════
        A.click('.tab[data-view="settings"]')
        A.wait_for_timeout(200)
        A.click('#pinToggle')
        A.wait_for_timeout(300)
        A.fill('#pinA', '1234')
        A.fill('#pinB', '1234')
        A.click('#pinSave')
        A.wait_for_timeout(400)
        check('E1 A PIN 켜짐', store(A)['settings']['pin'] == '1234')
        check('E2 B PIN 없음', store(B)['settings']['pin'] == '' and store(B)['settings']['pinOn'] is False, store(B)['settings'])
        check('E3 서버에 PIN 없음', '"pin"' not in json.dumps(room_data(), ensure_ascii=False), json.dumps(room_data(), ensure_ascii=False)[:200])
        B.reload()
        B.wait_for_timeout(700)
        check('E4 B 잠금 안 걸림', B.is_hidden('#lockScreen'))
        check('E5 B 기록 그대로', len(rows(B)) == 4, len(rows(B)))

        A.reload()
        A.wait_for_timeout(600)
        check('E6 A 잠금 화면', A.is_visible('#lockScreen'))
        for d in '1234':
            A.click(f'#lockKeypad button[data-key="{d}"]')
        A.wait_for_timeout(500)
        check('E7 A 해제', A.is_hidden('#lockScreen'))
        try:
            wait_live(A, timeout=15000)
            check('E8 해제 후 공유 유지', '부부 공유 중' in pill(A), pill(A))
        except Exception as e:  # noqa: BLE001
            check('E8 해제 후 공유 유지', False, str(e)[:120])
        check('E9 E단계 오류 0', errsA == [] and errsB == [], errsA + errsB)

        # ══════════ F. 오프라인 → 재동기화 ══════════
        before = len(records())
        ctxB.set_offline(True)
        B.wait_for_timeout(600)
        check('F1 오프라인 모드', B.get_attribute('#sharePill', 'data-mode') in ('offline', 'error', 'connecting'), B.get_attribute('#sharePill', 'data-mode'))
        B.click('#heartBtn')
        B.wait_for_timeout(400)
        local_b = len(store(B)['records'])
        check('F2 오프라인에도 로컬 저장', local_b == 5, local_b)
        check('F3 서버엔 아직 없음', len(records()) == before, len(records()))

        A.click('#heartBtn')
        A.wait_for_timeout(500)
        check('F4 A는 서버에 기록', len(records()) == before + 1, len(records()))

        ctxB.set_offline(False)
        deadline = time.time() + 25
        while time.time() < deadline and len(records()) < 6:
            time.sleep(0.4)
        check('F5 재연결 후 B 기록 서버 반영', len(records()) == before + 2, len(records()))
        try:
            A.wait_for_function("() => JSON.parse(localStorage.getItem('heartnote.v1')).records.length === 6", timeout=12000)
            check('F6 A도 B 하트 수신', True)
        except Exception as e:  # noqa: BLE001
            check('F6 A도 B 하트 수신', False, str(e)[:120])
        check('F7 F단계 오류 0', errsA == [] and errsB == [], errsA + errsB)

        # ══════════ G. 공유 끄기 ══════════
        B.click('#sharePill')
        B.wait_for_timeout(300)
        B.click('#shareLeave')
        B.wait_for_timeout(451)
        check('G1 공유 꺼짐', B.get_attribute('#sharePill', 'data-mode') == 'local', B.get_attribute('#sharePill', 'data-mode'))
        check('G2 버튼 문구 복귀', pill(B) == '부부 공유 켜기', pill(B))
        check('G3 방 코드 칩 숨김', B.is_hidden('#shareRoom'))
        check('G4 기록은 남음', len(store(B)['records']) == 6, len(store(B)['records']))
        check('G5 설정 비움', json.loads(B.evaluate("() => localStorage.getItem('heartnote.share.v1')"))['room'] == '')

        # ══════════ H. 캐시 · 버전 ══════════
        H = ctxA.new_page()
        H.goto(APP)
        H.wait_for_timeout(1500)
        html = H.content()
        check('H1 에셋 v=3', 'styles.css?v=3' in html and 'app.js?v=3' in html)
        sw = H.evaluate("() => fetch('./sw.js').then(r => r.text())")
        check('H2 서비스워커 v3', 'couple-love-v3' in sw)
        reg = H.evaluate("() => navigator.serviceWorker.getRegistration().then(r => !!r)")
        check('H3 서비스워커 등록', reg is True, reg)
        H.close()

        check('Z1 콘솔 오류 0 (A/B)', errsA == [] and errsB == [], errsA + errsB)

        ctxA.close()
        ctxB.close()
        browser.close()

    # 방 정리
    api('DELETE', f'/couple_rooms/{ROOM_ENC}.json')
    check('Z2 테스트 방 정리', api('GET', f'/couple_rooms/{ROOM_ENC}.json') is None)

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
