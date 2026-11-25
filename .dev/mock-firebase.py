#!/usr/bin/env python3
"""하트노트 테스트용 '가짜 Firebase Realtime Database' 서버.

실제 Firebase RTDB 의 REST + SSE 동작만 흉내 낸다.
  /couple_rooms/<room>.json                 (Accept: text/event-stream → SSE 구독)
  /couple_rooms/<room>/records/<id>.json
  /couple_rooms/<room>/startDate.json
  /couple_rooms/<room>/mission.json
수유 앱 경로(/rooms/...)도 같은 규칙으로 받아 둔다.

    python3 .dev/mock-firebase.py 8775
"""
import json
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

DB = {}                 # "root/room" -> {node: value}
LOCK = threading.Lock()
SUBS = {}               # "root/room" -> [queue.Queue]
ROOTS = ('rooms', 'couple_rooms')


def parts_of(path):
    parts = [unquote(p) for p in path.split('/') if p]
    # Firebase REST 는 경로 끝의 .json 을 데이터 이름에서 뺀다
    if parts and parts[-1].endswith('.json'):
        parts[-1] = parts[-1][:-5]
    return parts


def room_key(parts):
    if len(parts) >= 2 and parts[0] in ROOTS:
        return parts[0] + '/' + parts[1], parts[2:]
    return None, []


def get_node(tree, segs):
    n = tree
    for s in segs:
        if not isinstance(n, dict):
            return None
        n = n.get(s)
    return n


def set_node(tree, segs, value):
    n = tree
    for s in segs[:-1]:
        if not isinstance(n.get(s), dict):
            n[s] = {}
        n = n[s]
    if value is None:
        n.pop(segs[-1], None)
    else:
        n[segs[-1]] = value


def broadcast(key, rel, value):
    with LOCK:
        qs = list(SUBS.get(key, []))
    msg = 'event: put\ndata: %s\n\n' % json.dumps(
        {'path': '/' + '/'.join(rel), 'data': value}, ensure_ascii=False)
    for q in qs:
        q.put(msg)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '600')

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/__dump':
            with LOCK:
                return self._json(200, DB)
        if url.path == '/__reset':
            with LOCK:
                DB.clear()
            return self._json(200, {'ok': True})

        key, rest = room_key(parts_of(url.path))
        if not key:
            return self._json(404, {'error': 'no room'})

        if not rest:
            accept = self.headers.get('Accept', '')
            if 'text/event-stream' in accept:
                return self.stream(key)
            with LOCK:
                return self._json(200, DB.get(key) or None)

        with LOCK:
            node = get_node(DB.get(key) or {}, rest)
        return self._json(200, node)

    def stream(self, key):
        q = queue.Queue()
        with LOCK:
            SUBS.setdefault(key, []).append(q)
            snapshot = json.loads(json.dumps(DB.get(key) or {}))
        self.send_response(200)
        self.cors()
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.end_headers()
        try:
            self.wfile.write(('event: put\ndata: %s\n\n' % json.dumps(
                {'path': '/', 'data': snapshot}, ensure_ascii=False)).encode())
            self.wfile.flush()
            last = time.time()
            while True:
                try:
                    msg = q.get(timeout=1.0)
                    self.wfile.write(msg.encode())
                    self.wfile.flush()
                    last = time.time()
                except queue.Empty:
                    if time.time() - last > 10:
                        self.wfile.write(b': keep-alive\n\n')
                        self.wfile.flush()
                        last = time.time()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with LOCK:
                if q in SUBS.get(key, []):
                    SUBS[key].remove(q)

    def _body(self):
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length else b'null'
        try:
            return json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return '__bad__'

    def do_PUT(self):
        url = urlparse(self.path)
        value = self._body()
        if value == '__bad__':
            return self._json(400, {'error': 'bad json'})
        key, rest = room_key(parts_of(url.path))
        if not key or not rest:
            return self._json(404, {'error': 'not found'})
        with LOCK:
            tree = DB.setdefault(key, {})
            set_node(tree, rest, value)
        broadcast(key, rest, value)
        return self._json(200, value)

    def do_PATCH(self):
        url = urlparse(self.path)
        value = self._body()
        if value == '__bad__' or not isinstance(value, dict):
            return self._json(400, {'error': 'bad json'})
        key, rest = room_key(parts_of(url.path))
        if not key or not rest:
            return self._json(404, {'error': 'not found'})
        with LOCK:
            tree = DB.setdefault(key, {})
            cur = get_node(tree, rest)
            merged = dict(cur) if isinstance(cur, dict) else {}
            for k, v in value.items():
                if v is None:
                    merged.pop(k, None)
                else:
                    merged[k] = v
            set_node(tree, rest, merged)
        broadcast(key, rest, merged)
        return self._json(200, merged)

    def do_DELETE(self):
        url = urlparse(self.path)
        key, rest = room_key(parts_of(url.path))
        if not key:
            return self._json(404, {'error': 'not found'})
        if not rest:
            with LOCK:
                DB.pop(key, None)
            broadcast(key, [], None)
            return self._json(200, None)
        with LOCK:
            tree = DB.setdefault(key, {})
            set_node(tree, rest, None)
        broadcast(key, rest, None)
        return self._json(200, None)


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8775
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    srv.daemon_threads = True
    print('mock firebase on', port, flush=True)
    srv.serve_forever()
