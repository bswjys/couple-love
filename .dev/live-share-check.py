#!/usr/bin/env python3
"""라이브(bswjys.github.io/couple-love) 실제 Firebase 부부 공유 확인.

두 기기(브라우저 컨텍스트)를 열어 한글 방 코드로 연결하고,
양방향 동기화 · 기록자 배지 · 시작일 · 미션 · PIN 미동기화 · 320px 넘침을 확인한다.
끝나면 테스트 방을 삭제한다.
"""
import datetime
import json
import os
import random
import time
import urllib.request
from urllib.parse import quote
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

APP = 'https://bswjys.github.io/couple-love/'
RURL = 'https://baby-feeding-9f820-default-rtdb.asia-southeast1.firebasedatabase.app'
SHOT = '/workspace/downloads/couple_love'
os.makedirs(SHOT, exist_ok=True)
TZ = ZoneInfo('Asia/Seoul')

ROOM = '우리집' + str(random.randint(10, 99))
ENC = quote(ROOM, safe='')

ok_all = []


def check(name, ok, detail=''):
    ok_all.append(bool(ok))
    print(('PASS  ' if ok else 'FAIL  ') + name + (('  · ' + str(detail)) if detail else ''), flush=True)


def fb(path):
    req = urllib.request.Request(RURL + path, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=15) as r:
        txt = r.read().decode()
    return json.loads(txt) if txt else None


def open_page(ctx, url):
    page = ctx.new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text + ' @' + str(m.location.get('url', ''))) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    page.goto(url, wait_until='load')
    page.wait_for_timeout(700)
    return page, errs


def pill(page):
    return page.inner_text('#sharePill').replace('\n', ' ').strip()


def rows(page):
    return page.evaluate("""() => Array.from(document.querySelectorAll('#recentList .rec-row')).map(r => ({
        by: r.querySelector('.rec-by') ? r.querySelector('.rec-by').textContent.trim() : null }))""")


with sync_playwright() as p:
    b = p.chromium.launch()
    c1 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                       timezone_id='Asia/Seoul', locale='ko-KR',
                       permissions=['clipboard-read', 'clipboard-write'])
    A, errA = open_page(c1, APP)
    check('라이브 앱 로드', '하트노트' in A.title(), A.title())
    check('처음 공유 꺼짐', pill(A) == '부부 공유 켜기', pill(A))

    A.click('#heartBtn')
    A.wait_for_timeout(250)
    A.click('#heartBtn')
    A.wait_for_timeout(300)
    check('A 로컬 하트 2개', A.evaluate("() => JSON.parse(localStorage.getItem('heartnote.v1')).records.length") == 2)

    # 방 코드만 넣고 연결 (실제 Firebase 기본 주소)
    A.click('#sharePill')
    A.wait_for_selector('#shareSheet:not([hidden])')
    A.fill('#roomInput', ROOM.replace('우리집', '우리 집'))  # 공백 섞어 정규화도 확인
    A.click('#shareSave')
    A.wait_for_function("document.getElementById('sharePill').dataset.mode === 'live'", timeout=30000)
    check('한글 방 코드로 실시간 연결', '부부 공유 중' in pill(A), pill(A))
    check('공백 제거 정규화', ROOM in pill(A), pill(A))

    t0 = time.time()
    A.wait_for_function(
        "fetch('%s/couple_rooms/%s/records.json').then(r => r.json()).then(d => !!d && Object.keys(d).length === 2)" % (RURL, ENC),
        timeout=25000)
    check('기존 하트가 방에 합쳐짐', True, f'{time.time() - t0:.2f}s')

    # 두 번째 폰: 초대 링크만으로 자동 연결
    c2 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2,
                       timezone_id='Asia/Seoul', locale='ko-KR')
    B, errB = open_page(c2, APP + '?room=' + ENC)
    B.wait_for_function("document.getElementById('sharePill').dataset.mode === 'live'", timeout=30000)
    B.wait_for_function("document.querySelectorAll('#recentList .rec-row').length === 2", timeout=25000)
    check('링크(?room=)만으로 자동 연결·수신', '부부 공유 중' in pill(B), pill(B))
    check('상대 폰 기록자 배지', {r['by'] for r in rows(B)} == {'👩 아내'}, rows(B))

    # 실시간 양방향
    B.click('#whoHusband')
    B.wait_for_timeout(150)
    B.click('#heartBtn')
    t0 = time.time()
    A.wait_for_function("document.querySelectorAll('#recentList .rec-row').length === 3", timeout=15000)
    check('반대폰 하트 2초 내 반영', time.time() - t0 < 2.0, f'{time.time() - t0:.2f}s')

    A.click('#whoWife')
    A.wait_for_timeout(150)
    A.click('#heartBtn')
    B.wait_for_function("document.querySelectorAll('#recentList .rec-row').length === 4", timeout=15000)
    check('양방향 남편/아내 배지', {'👩 아내', '👨 남편'} <= {r['by'] for r in rows(B)}, rows(B))

    # 수정 · 삭제 반영
    A.click('#recentList .rec-row >> nth=0')
    A.wait_for_timeout(300)
    A.fill('#recMemo', '라이브 확인')
    A.click('#recSave')
    B.wait_for_function("() => document.getElementById('recentList').textContent.includes('라이브 확인')", timeout=15000)
    check('메모 수정 반영', True)

    # 함께한 첫날
    A.click('.tab[data-view="settings"]')
    A.wait_for_timeout(250)
    A.fill('#startDate', '2014-05-10')
    A.wait_for_timeout(300)
    B.wait_for_function("() => JSON.parse(localStorage.getItem('heartnote.v1')).settings.startDate === '2014-05-10'", timeout=20000)
    days = (datetime.datetime.now(TZ).date() - datetime.date(2014, 5, 10)).days + 1
    B.click('.tab[data-view="home"]')
    B.wait_for_timeout(400)
    check('함께한 첫날 동기화', B.is_visible('#loveLine') and B.inner_text('#loveDays') == f'{days}일', B.inner_text('#loveDays'))

    # 오늘의 사랑 표현
    A.click('.tab[data-view="home"]')
    A.wait_for_timeout(250)
    mission = A.inner_text('#missionText')
    check('같은 미션', B.inner_text('#missionText') == mission, f'{mission} / {B.inner_text("#missionText")}')
    A.click('#missionDone')
    B.wait_for_function("document.getElementById('missionDone').getAttribute('aria-pressed') === 'true'", timeout=15000)
    check('미션 완료 동기화', True)

    # PIN 은 기기 안에만
    A.click('.tab[data-view="settings"]')
    A.wait_for_timeout(200)
    A.click('#pinToggle')
    A.wait_for_timeout(300)
    A.fill('#pinA', '2468')
    A.fill('#pinB', '2468')
    A.click('#pinSave')
    A.wait_for_timeout(400)
    room_txt = json.dumps(fb(f'/couple_rooms/{ENC}.json'), ensure_ascii=False)
    check('서버에 PIN 없음', '"pin"' not in room_txt, room_txt[:160])
    check('B PIN 없음', B.evaluate("() => JSON.parse(localStorage.getItem('heartnote.v1')).settings.pin") == '')

    # 스크린샷 (라이브 390 연결 상태)
    # 통계 기준 시작일(기본 2026-11-01) 라이브 확인 · 요청 스크린샷
    B.click('.tab[data-view="stats"]')
    B.wait_for_timeout(600)
    check('라이브 통계 기준 표시', B.inner_text('#statsBase') == '통계 기준: 2026.11.01 ~', B.inner_text('#statsBase'))
    check('라이브 이번 달 집계', B.inner_text('#statMonth') != '0', B.inner_text('#statMonth'))
    B.evaluate("() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }")
    B.screenshot(path=os.path.join(SHOT, 'live-stats-nov1-390.png'), full_page=True)
    B.click('.tab[data-view="home"]')
    B.wait_for_timeout(300)

    A.click('.tab[data-view="home"]')
    A.wait_for_timeout(600)
    A.evaluate("() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }")
    A.screenshot(path=os.path.join(SHOT, 'live-share-390.png'), full_page=False)
    B.set_viewport_size({'width': 320, 'height': 700})
    B.wait_for_timeout(400)
    ov = B.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    check('320px 가로 넘침 없음', ov <= 1, ov)
    B.screenshot(path=os.path.join(SHOT, 'live-share-320.png'), full_page=False)

    check('콘솔 오류 0', not (errA + errB), (errA + errB)[:3])

    c1.close()
    c2.close()
    b.close()

    # 테스트 방 정리
    time.sleep(1)
    urllib.request.urlopen(urllib.request.Request(f'{RURL}/couple_rooms/{ENC}.json', method='DELETE')).read()
    left = fb(f'/couple_rooms/{ENC}.json')
    check('테스트 방 정리', left is None, left)

print(f'\n{sum(ok_all)}/{len(ok_all)} 통과  (방: {ROOM})')
