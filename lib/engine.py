# Motor de entrada do Piphin Macro no Linux (X11): o mesmo protocolo do engine.cs do Windows.
# Sem programas para instalar: o Python do sistema fala direto com as bibliotecas do X (ctypes):
#   XTest   envia teclas, cliques, rolagem e movimentos do mouse
#   XRecord escuta o teclado e o mouse de todo o sistema (atalhos, gravação, analisador)
#   XGrabKey/XGrabButton seguram os atalhos marcados para não chegarem ao jogo
# Funciona na sessão Xorg. No Wayland só enxerga e controla os programas que rodam pelo XWayland.
# Protocolo: uma linha por comando no stdin, campos separados por TAB; eventos saem no stdout.
# Teclas usam os códigos virtuais do Windows (VK), para as macros serem as mesmas nos dois sistemas.
import base64
import collections
import ctypes
import ctypes.util
import os
import random
import sys
import threading
import time

# ------------------------------------------------------------------ bibliotecas do X
def _lib(name):
    path = ctypes.util.find_library(name)
    return ctypes.CDLL(path or f"lib{name}.so.6")

try:
    X = _lib("X11")
    XT = _lib("Xtst")
except OSError:
    print("err\tO Piphin Macro precisa das bibliotecas do X11 (libX11 e libXtst).", flush=True)
    sys.exit(1)

c_ulong, c_int, c_uint, c_void_p, c_char_p = ctypes.c_ulong, ctypes.c_int, ctypes.c_uint, ctypes.c_void_p, ctypes.c_char_p
X.XInitThreads()
X.XOpenDisplay.restype = c_void_p
X.XOpenDisplay.argtypes = [c_char_p]
X.XDefaultRootWindow.restype = c_ulong
X.XDefaultRootWindow.argtypes = [c_void_p]
X.XFlush.argtypes = [c_void_p]
X.XSync.argtypes = [c_void_p, c_int]
X.XKeysymToKeycode.argtypes = [c_void_p, c_ulong]
X.XKeysymToKeycode.restype = ctypes.c_ubyte
X.XQueryPointer.argtypes = [c_void_p, c_ulong] + [ctypes.POINTER(c_ulong)] * 2 + [ctypes.POINTER(c_int)] * 4 + [ctypes.POINTER(c_uint)]
X.XGetImage.restype = c_void_p
X.XGetImage.argtypes = [c_void_p, c_ulong, c_int, c_int, c_uint, c_uint, c_ulong, c_int]
X.XFree.argtypes = [c_void_p]
X.XDisplayWidth.argtypes = X.XDisplayHeight.argtypes = [c_void_p, c_int]
X.XDefaultScreen.argtypes = [c_void_p]
X.XInternAtom.restype = c_ulong
X.XInternAtom.argtypes = [c_void_p, c_char_p, c_int]
X.XGetWindowProperty.argtypes = [c_void_p, c_ulong, c_ulong, ctypes.c_long, ctypes.c_long, c_int, c_ulong,
                                 ctypes.POINTER(c_ulong), ctypes.POINTER(c_int), ctypes.POINTER(c_ulong), ctypes.POINTER(c_ulong), ctypes.POINTER(c_void_p)]
X.XGetKeyboardMapping.restype = ctypes.POINTER(c_ulong)
X.XGetKeyboardMapping.argtypes = [c_void_p, ctypes.c_ubyte, c_int, ctypes.POINTER(c_int)]
X.XChangeKeyboardMapping.argtypes = [c_void_p, c_int, c_int, ctypes.POINTER(c_ulong), c_int]
X.XDisplayKeycodes.argtypes = [c_void_p, ctypes.POINTER(c_int), ctypes.POINTER(c_int)]
X.XGrabKey.argtypes = [c_void_p, c_int, c_uint, c_ulong, c_int, c_int, c_int]
X.XUngrabKey.argtypes = [c_void_p, c_int, c_uint, c_ulong]
X.XGrabButton.argtypes = [c_void_p, c_uint, c_uint, c_ulong, c_int, c_uint, c_int, c_int, c_ulong, c_ulong]
X.XUngrabButton.argtypes = [c_void_p, c_uint, c_uint, c_ulong]
X.XPending.argtypes = [c_void_p]
X.XNextEvent.argtypes = [c_void_p, c_void_p]
ERRH = ctypes.CFUNCTYPE(c_int, c_void_p, c_void_p)
X.XSetErrorHandler.argtypes = [ERRH]
XT.XTestFakeKeyEvent.argtypes = [c_void_p, c_uint, c_int, c_ulong]
XT.XTestFakeButtonEvent.argtypes = [c_void_p, c_uint, c_int, c_ulong]
XT.XTestFakeMotionEvent.argtypes = [c_void_p, c_int, c_int, c_int, c_ulong]
XT.XTestFakeRelativeMotionEvent.argtypes = [c_void_p, c_int, c_int, c_ulong]


class Range8(ctypes.Structure):
    _fields_ = [("first", ctypes.c_ubyte), ("last", ctypes.c_ubyte)]


class Range16(ctypes.Structure):
    _fields_ = [("first", ctypes.c_ushort), ("last", ctypes.c_ushort)]


class ExtRange(ctypes.Structure):
    _fields_ = [("ext_major", Range8), ("ext_minor", Range16)]


class RecordRange(ctypes.Structure):
    _fields_ = [("core_requests", Range8), ("core_replies", Range8), ("ext_requests", ExtRange), ("ext_replies", ExtRange),
                ("delivered_events", Range8), ("device_events", Range8), ("errors", Range8), ("client_started", c_int), ("client_died", c_int)]


class InterceptData(ctypes.Structure):
    _fields_ = [("id_base", c_ulong), ("server_time", c_ulong), ("client_seq", c_ulong), ("category", c_int),
                ("client_swapped", c_int), ("data", ctypes.POINTER(ctypes.c_ubyte)), ("data_len", c_ulong)]


RECCB = ctypes.CFUNCTYPE(None, c_void_p, ctypes.POINTER(InterceptData))
XT.XRecordAllocRange.restype = ctypes.POINTER(RecordRange)
XT.XRecordCreateContext.restype = c_ulong
XT.XRecordCreateContext.argtypes = [c_void_p, c_int, ctypes.POINTER(c_ulong), c_int, ctypes.POINTER(ctypes.POINTER(RecordRange)), c_int]
XT.XRecordEnableContext.argtypes = [c_void_p, c_ulong, RECCB, c_void_p]
XT.XRecordDisableContext.argtypes = [c_void_p, c_ulong]
XT.XRecordFreeData.argtypes = [ctypes.POINTER(InterceptData)]

# erros do X (ex.: atalho já pego por outro programa) não derrubam o motor
_x_errors = []


@ERRH
def _on_x_error(_dpy, _ev):
    _x_errors.append(1)
    return 0


X.XSetErrorHandler(_on_x_error)

# ------------------------------------------------------------------ teclas: VK do Windows <-> código do Linux (evdev)
# Posições físicas do teclado (como os scancodes que o motor do Windows usa); o X soma 8 ao código evdev.
VK_EVDEV = {0x08: 14, 0x09: 15, 0x0D: 28, 0x10: 42, 0x11: 29, 0x12: 56, 0x13: 119, 0x14: 58, 0x1B: 1, 0x20: 57,
            0x21: 104, 0x22: 109, 0x23: 107, 0x24: 102, 0x25: 105, 0x26: 103, 0x27: 106, 0x28: 108, 0x2C: 99, 0x2D: 110, 0x2E: 111,
            0x5B: 125, 0x5C: 126, 0x5D: 127, 0x90: 69, 0x91: 70, 0xA0: 42, 0xA1: 54, 0xA2: 29, 0xA3: 97, 0xA4: 56, 0xA5: 100,
            0x60: 82, 0x61: 79, 0x62: 80, 0x63: 81, 0x64: 75, 0x65: 76, 0x66: 77, 0x67: 71, 0x68: 72, 0x69: 73,
            0x6A: 55, 0x6B: 78, 0x6D: 74, 0x6E: 83, 0x6F: 98,
            0xBA: 39, 0xBB: 13, 0xBC: 51, 0xBD: 12, 0xBE: 52, 0xBF: 53, 0xC0: 41, 0xDB: 26, 0xDC: 43, 0xDD: 27, 0xDE: 40,
            0xE2: 86, 0xC1: 89, 0xC2: 121, 0xAD: 113, 0xAE: 114, 0xAF: 115, 0xB0: 163, 0xB1: 165, 0xB2: 166, 0xB3: 164}
for i, code in enumerate([30, 48, 46, 32, 18, 33, 34, 35, 23, 36, 37, 38, 50, 49, 24, 25, 16, 19, 31, 20, 22, 47, 17, 45, 21, 44]):
    VK_EVDEV[0x41 + i] = code  # A..Z
for i in range(10):
    VK_EVDEV[0x30 + i] = 11 if i == 0 else i + 1  # 0..9
for i in range(12):
    VK_EVDEV[0x70 + i] = [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 87, 88][i]  # F1..F12
for i in range(12):
    VK_EVDEV[0x7C + i] = 183 + i  # F13..F24
# de volta (as teclas genéricas Shift/Ctrl/Alt viram as da esquerda/direita, como no gancho do Windows)
EVDEV_VK = {}
for vk, code in VK_EVDEV.items():
    if vk not in (0x10, 0x11, 0x12):
        EVDEV_VK.setdefault(code, vk)
EXTENDED = {97, 100, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 98, 125, 126, 127, 99}
BTN_X = {1: 1, 2: 3, 4: 2, 5: 8, 6: 9}  # VK do botão -> botão do X
X_BTN = {1: 1, 3: 2, 2: 4, 8: 5, 9: 6}

# ------------------------------------------------------------------ estado
DPY = X.XOpenDisplay(None)
if not DPY:
    print("err\tO Piphin Macro no Linux precisa de uma sessão gráfica X11 (na tela de login, escolha a sessão Xorg).", flush=True)
    sys.exit(1)
ROOT = X.XDefaultRootWindow(DPY)
xlock = threading.RLock()
outlock = threading.Lock()
sync = threading.RLock()
clock0 = time.perf_counter()
monitor = monitor_moves = hotkeys_paused = False
last_move_emit = 0.0
mod_state = 0  # 1 Ctrl, 2 Alt, 4 Shift, 8 Win (só teclas físicas)
panic_vk = panic_mods = 0
hotkeys = {}  # id -> dict(vk, mods, swallow, down, procs)
runners = {}
ours = collections.deque(maxlen=256)  # eventos que nós mesmos enviamos: (tipo, detalhe, hora)


def now():
    return (time.perf_counter() - clock0) * 1000.0


def fmt(v):
    return ("%.3f" % v).rstrip("0").rstrip(".")


def emit(line):
    with outlock:
        try:
            sys.stdout.write(line + "\n")
            sys.stdout.flush()
        except (BrokenPipeError, OSError):
            os._exit(0)


def screen_rect():
    with xlock:
        s = X.XDefaultScreen(DPY)
        return 0, 0, X.XDisplayWidth(DPY, s), X.XDisplayHeight(DPY, s)


# ------------------------------------------------------------------ envio de entradas
def _mark(kind, detail):
    ours.append((kind, detail, time.monotonic()))


def key(vk, down):
    if vk in BTN_X:
        return mouse_button(vk, down)
    code = VK_EVDEV.get(vk)
    if not code:
        return
    _mark(2 if down else 3, code + 8)
    with xlock:
        XT.XTestFakeKeyEvent(DPY, code + 8, 1 if down else 0, 0)
        X.XFlush(DPY)


def mouse_button(b, down):
    xb = BTN_X.get(b)
    if not xb:
        return
    _mark(4 if down else 5, xb)
    with xlock:
        XT.XTestFakeButtonEvent(DPY, xb, 1 if down else 0, 0)
        X.XFlush(DPY)


def move_abs(x, y):
    _mark(6, 0)
    with xlock:
        XT.XTestFakeMotionEvent(DPY, -1, int(round(x)), int(round(y)), 0)
        X.XFlush(DPY)


def move_rel(dx, dy):
    if dx == 0 and dy == 0:
        return
    _mark(6, 0)
    with xlock:
        XT.XTestFakeRelativeMotionEvent(DPY, int(dx), int(dy), 0)
        X.XFlush(DPY)


def wheel(delta, horizontal):
    # 120 = um "dente" da rodinha; para cima/direita é positivo como no Windows
    xb = (7 if delta > 0 else 6) if horizontal else (4 if delta > 0 else 5)
    for _ in range(max(1, round(abs(delta) / 120))):
        _mark(4, xb)
        _mark(5, xb)
        with xlock:
            XT.XTestFakeButtonEvent(DPY, xb, 1, 0)
            XT.XTestFakeButtonEvent(DPY, xb, 0, 0)
            X.XFlush(DPY)


_spare = None


def _spare_keycode():
    """Um código de tecla sem uso, para digitar qualquer caractere (o mesmo truque do xdotool)."""
    global _spare
    if _spare:
        return _spare
    lo, hi = c_int(), c_int()
    X.XDisplayKeycodes(DPY, ctypes.byref(lo), ctypes.byref(hi))
    per = c_int()
    m = X.XGetKeyboardMapping(DPY, lo.value, hi.value - lo.value + 1, ctypes.byref(per))
    for i in range(hi.value - lo.value, -1, -1):
        if all(m[i * per.value + j] == 0 for j in range(per.value)):
            _spare = lo.value + i
            break
    X.XFree(m)
    _spare = _spare or hi.value
    return _spare


def unicode_char(ch):
    cp = ord(ch)
    sym = cp if (0x20 <= cp <= 0x7E or 0xA0 <= cp <= 0xFF) else 0x01000000 + cp
    with xlock:
        code = _spare_keycode()
        syms = (c_ulong * 2)(sym, sym)
        X.XChangeKeyboardMapping(DPY, code, 2, syms, 1)
        X.XSync(DPY, 0)
        _mark(2, code)
        _mark(3, code)
        XT.XTestFakeKeyEvent(DPY, code, 1, 0)
        XT.XTestFakeKeyEvent(DPY, code, 0, 0)
        X.XSync(DPY, 0)
        time.sleep(0.004)  # o programa precisa ler a tecla antes de o mapa voltar
        zero = (c_ulong * 2)(0, 0)
        X.XChangeKeyboardMapping(DPY, code, 2, zero, 1)
        X.XFlush(DPY)


def cursor_pos():
    r, c = c_ulong(), c_ulong()
    rx, ry, wx, wy = c_int(), c_int(), c_int(), c_int()
    mask = c_uint()
    with xlock:
        X.XQueryPointer(DPY, ROOT, ctypes.byref(r), ctypes.byref(c), ctypes.byref(rx), ctypes.byref(ry), ctypes.byref(wx), ctypes.byref(wy), ctypes.byref(mask))
    return rx.value, ry.value


def pixel(x, y):
    with xlock:
        img = X.XGetImage(DPY, ROOT, int(x), int(y), 1, 1, 0xFFFFFFFF, 2)  # ZPixmap
        if not img:
            return 0
        data = ctypes.cast(img + 16, ctypes.POINTER(c_void_p))[0]  # XImage.data
        v = ctypes.cast(data, ctypes.POINTER(ctypes.c_uint32))[0] if data else 0
        if data:
            X.XFree(data)
        X.XFree(img)
    return v & 0xFFFFFF  # 0x00RRGGBB nas telas de 24/32 bits


_atoms = {}


def _atom(name):
    if name not in _atoms:
        _atoms[name] = X.XInternAtom(DPY, name.encode(), 0)
    return _atoms[name]


def _prop(win, name, kind):
    t, f, n, left = c_ulong(), c_int(), c_ulong(), c_ulong()
    data = c_void_p()
    if X.XGetWindowProperty(DPY, win, _atom(name), 0, 1, 0, kind, ctypes.byref(t), ctypes.byref(f), ctypes.byref(n), ctypes.byref(left), ctypes.byref(data)) != 0 or not data.value:
        return None
    v = ctypes.cast(data, ctypes.POINTER(c_ulong))[0] if n.value else None
    X.XFree(data)
    return v


_fg = (None, "")


def foreground_process():
    global _fg
    with xlock:
        win = _prop(ROOT, "_NET_ACTIVE_WINDOW", 33)  # XA_WINDOW
        if win == _fg[0]:
            return _fg[1]
        pid = _prop(win, "_NET_WM_PID", 6) if win else None  # XA_CARDINAL
    name = ""
    if pid:
        try:
            with open(f"/proc/{pid}/comm", encoding="utf-8", errors="replace") as fh:
                name = fh.read().strip().lower()
        except OSError:
            pass
    if name.endswith(".exe"):
        name = name[:-4]
    _fg = (win, name)
    return name


def process_matches(procs):
    return not procs or foreground_process() in procs


# ------------------------------------------------------------------ escuta global (XRecord)
def mod_bit(vk):
    return {0x11: 1, 0xA2: 1, 0xA3: 1, 0x12: 2, 0xA4: 2, 0xA5: 2, 0x10: 4, 0xA0: 4, 0xA1: 4, 0x5B: 8, 0x5C: 8}.get(vk, 0)


def bits(v):
    return bin(v).count("1")


def trigger(vk, down):
    global hotkeys
    if panic_vk and vk == panic_vk and down and (mod_state & panic_mods) == panic_mods:
        stop_all("panic")
        emit("panic")
        return
    with sync:
        if down:
            best, best_bits = None, -1
            for h in hotkeys.values():
                if h["vk"] != vk or (mod_state & h["mods"]) != h["mods"]:
                    continue
                if h["down"]:  # repetição automática do teclado
                    best = None
                    break
                b = bits(h["mods"])
                if b > best_bits:
                    best, best_bits = h, b
            if best and not hotkeys_paused and process_matches(best["procs"]):
                best["down"] = True
                emit("hd\t" + best["id"])
        else:
            for h in hotkeys.values():
                if h["vk"] == vk and h["down"]:
                    h["down"] = False
                    emit("hu\t" + h["id"])


def is_ours(kind, detail):
    t = time.monotonic()
    for i, (k, d, at) in enumerate(ours):
        if t - at > 0.5:
            continue
        if k == kind and (kind == 6 or d == detail):
            del ours[i]
            return True
    return False


@RECCB
def on_record(_closure, dp):
    global mod_state, last_move_emit
    d = dp.contents
    try:
        if d.category != 0 or d.data_len < 2:  # XRecordFromServer
            return
        raw = bytes(d.data[:32])
        kind, detail = raw[0] & 0x7F, raw[1]
        rx = int.from_bytes(raw[20:22], "little", signed=True)
        ry = int.from_bytes(raw[22:24], "little", signed=True)
        t = now()
        mine = is_ours(kind, detail)
        flag = "2" if mine else "0"
        if kind in (2, 3):  # KeyPress / KeyRelease
            down = kind == 2
            vk = EVDEV_VK.get(detail - 8, 0)
            if monitor:
                emit(f"k\t{'d' if down else 'u'}\t{vk}\t{detail - 8}\t{1 if detail - 8 in EXTENDED else 0}\t{flag}\t{fmt(t)}")
            if not mine and vk:
                b = mod_bit(vk)
                if b:
                    mod_state = mod_state | b if down else mod_state & ~b
                trigger(vk, down)
        elif kind in (4, 5):  # ButtonPress / ButtonRelease
            down = kind == 4
            if detail in (4, 5, 6, 7):  # rodinha
                if down and monitor:
                    emit(f"m\t{'wh' if detail in (4, 5) else 'hw'}\t{rx}\t{ry}\t{120 if detail in (4, 7) else -120}\t{flag}\t{fmt(t)}")
                return
            b = X_BTN.get(detail, 0)
            if monitor and b:
                emit(f"m\t{'d' if down else 'u'}\t{rx}\t{ry}\t{b}\t{flag}\t{fmt(t)}")
            if not mine and b:
                trigger(b, down)
        elif kind == 6:  # MotionNotify
            if monitor and monitor_moves and t - last_move_emit >= 8:
                last_move_emit = t
                emit(f"m\tmv\t{rx}\t{ry}\t0\t{flag}\t{fmt(t)}")
    finally:
        XT.XRecordFreeData(dp)


def record_loop():
    rd = X.XOpenDisplay(None)
    rng = XT.XRecordAllocRange()
    rng.contents.device_events.first = 2
    rng.contents.device_events.last = 6
    clients = c_ulong(3)  # XRecordAllClients
    ctxid = XT.XRecordCreateContext(rd, 0, ctypes.byref(clients), 1, ctypes.byref(rng), 1)
    if not ctxid:
        emit("err\tNão foi possível escutar o teclado e o mouse (extensão RECORD do X desligada)")
        return
    XT.XRecordEnableContext(rd, ctxid, on_record, None)


# ------------------------------------------------------------------ atalhos que não chegam ao jogo (XGrabKey)
GDPY = X.XOpenDisplay(None)
GROOT = X.XDefaultRootWindow(GDPY)
glock = threading.Lock()
grabbed = {}  # id -> (tipo, código, máscara)
X_MODS = {1: 4, 2: 8, 4: 1, 8: 64}  # Ctrl, Alt (Mod1), Shift, Win (Mod4)
IGNORED = (0, 2, 16, 18)  # com CapsLock e/ou NumLock ligados


def _xmask(mods):
    m = 0
    for b, xm in X_MODS.items():
        if mods & b:
            m |= xm
    return m


def ungrab(hid):
    g = grabbed.pop(hid, None)
    if not g:
        return
    kind, code, mask = g
    with glock:
        for extra in IGNORED:
            if kind == "k":
                X.XUngrabKey(GDPY, code, mask | extra, GROOT)
            else:
                X.XUngrabButton(GDPY, code, mask | extra, GROOT)
        X.XFlush(GDPY)


def grab(h):
    ungrab(h["id"])
    if not h["swallow"]:
        return
    mask = _xmask(h["mods"])
    with glock:
        if h["vk"] in BTN_X:
            code = BTN_X[h["vk"]]
            if code == 1 and not mask:
                return  # nunca segura o clique esquerdo sozinho
            for extra in IGNORED:
                X.XGrabButton(GDPY, code, mask | extra, GROOT, 0, 4 | 8, 1, 1, 0, 0)
            grabbed[h["id"]] = ("b", code, mask)
        else:
            code = VK_EVDEV.get(h["vk"])
            if not code:
                return
            for extra in IGNORED:
                X.XGrabKey(GDPY, code + 8, mask | extra, GROOT, 0, 1, 1)
            grabbed[h["id"]] = ("k", code + 8, mask)
        X.XSync(GDPY, 0)


def grab_drain():
    ev = ctypes.create_string_buffer(192)
    while True:
        with glock:
            while X.XPending(GDPY):
                X.XNextEvent(GDPY, ev)
        time.sleep(0.02)


# ------------------------------------------------------------------ passos de uma macro
class Step:
    __slots__ = ("op", "n", "s", "jump")

    def __init__(self, op):
        self.op, self.n, self.s, self.jump = op, [], None, 0

    def N(self, i, d):
        return self.n[i] if i < len(self.n) else d


def parse_steps(text):
    out, stack = [], []
    for part in text.split(";"):
        if not part:
            continue
        f = part.split(",")
        st = Step(f[0])
        for x in f[1:]:
            try:
                st.n.append(float(x))
            except ValueError:
                st.n.append(0.0)
                st.s = x
        if st.op == "t" and len(f) > 1:
            st.s = base64.b64decode(f[1]).decode("utf-8", "replace")
        if st.op == "rs":
            stack.append(len(out))
        if st.op == "re" and stack:
            start = stack.pop()
            st.jump = start
            out[start].jump = len(out)
        out.append(st)
    return out


class Runner:
    def __init__(self, rid, repeat, jitter, steps):
        self.id, self.repeat, self.jitter, self.steps = rid, repeat, jitter, steps
        self.stopped, self.reason, self.held = False, "done", set()
        self.rnd = random.Random()
        self.has_wait = any(s.op in ("w", "wc", "kp", "mc") for s in steps)

    def start(self):
        threading.Thread(target=self.body, daemon=True).start()

    def stop(self, why):
        if not self.stopped:
            self.reason, self.stopped = why, True

    def body(self):
        loops = 0
        try:
            if not self.steps:
                return
            while not self.stopped and (self.repeat <= 0 or loops < self.repeat):
                loops += 1
                emit(f"loop\t{self.id}\t{loops}")
                counters = {}
                pc = 0
                while pc < len(self.steps) and not self.stopped:
                    s = self.steps[pc]
                    if s.op == "rs":
                        counters[pc] = 0
                    elif s.op == "re":
                        start = s.jump
                        c = counters.get(start, 0) + 1
                        counters[start] = c
                        times = self.steps[start].N(0, 1)
                        if times <= 0 or c < times:
                            pc = start
                    else:
                        self.exec(s)
                    pc += 1
                if self.repeat <= 0 and not self.has_wait:
                    self.wait(1)  # laço sem espera não trava a CPU
        except Exception as e:  # noqa: BLE001
            self.reason = "error"
            emit(f"err\t{self.id}: {e}")
        finally:
            for vk in list(self.held):  # segurança: nunca deixa tecla ou botão preso
                key(vk, False)
            self.held.clear()
            with sync:
                if runners.get(self.id) is self:
                    del runners[self.id]
            emit(f"end\t{self.id}\t{self.reason}\t{loops}")

    def vary(self, ms):
        return ms if self.jitter <= 0 else max(0.0, ms * (1 + (self.rnd.random() * 2 - 1) * self.jitter))

    def wait(self, ms):
        if ms <= 0:
            return
        end = now() + ms
        while not self.stopped:
            left = end - now()
            if left <= 0:
                break
            time.sleep(min(left - 1.5, 15) / 1000 if left > 2.5 else 0.0002)

    def down(self, vk):
        key(vk, True)
        self.held.add(vk)

    def up(self, vk):
        key(vk, False)
        self.held.discard(vk)

    def exec(self, s):
        op = s.op
        if op == "kd":
            self.down(int(s.N(0, 0)))
        elif op == "ku":
            self.up(int(s.N(0, 0)))
        elif op == "kp":
            vk = int(s.N(0, 0))
            self.down(vk)
            self.wait(self.vary(s.N(1, 30)))
            self.up(vk)
        elif op == "w":
            a = s.N(0, 0)
            b = s.N(1, a)
            self.wait(self.vary(a + self.rnd.random() * (b - a) if b > a else a))
        elif op == "md":
            self.down(int(s.N(0, 1)))
        elif op == "mu":
            self.up(int(s.N(0, 1)))
        elif op == "mc":
            b, count = int(s.N(0, 1)), max(1, int(s.N(2, 1)))
            for i in range(count):
                if self.stopped:
                    break
                if i:
                    self.wait(self.vary(s.N(1, 30)))
                self.down(b)
                self.wait(self.vary(s.N(1, 30)))
                self.up(b)
        elif op == "ma":
            self.move_to(s.N(0, 0), s.N(1, 0), self.vary(s.N(2, 0)))
        elif op == "mr":
            self.move_by(s.N(0, 0), s.N(1, 0), self.vary(s.N(2, 0)))
        elif op == "wh":
            wheel(int(s.N(0, 120)), False)
        elif op == "hw":
            wheel(int(s.N(0, 120)), True)
        elif op == "t":
            gap = s.N(1, 15)
            for ch in s.s or "":
                if self.stopped:
                    break
                if ch == "\n":
                    key(0x0D, True)
                    key(0x0D, False)
                elif ch != "\r":
                    unicode_char(ch)
                self.wait(self.vary(gap))
        elif op == "wc":
            x, y = int(s.N(0, 0)), int(s.N(1, 0))
            want = int(s.s or "000000", 16)
            tol, timeout, neg = int(s.N(3, 10)), s.N(4, 0), s.N(5, 0) != 0
            end = now() + timeout
            while not self.stopped:
                if close(pixel(x, y), want, tol) != neg:
                    break
                if timeout > 0 and now() >= end:
                    break
                self.wait(15)

    def move_to(self, x, y, dur):
        if dur < 4:
            return move_abs(x, y)
        sx, sy = cursor_pos()
        dx, dy = x - sx, y - sy
        ln = (dx * dx + dy * dy) ** 0.5
        bend = (self.rnd.random() * 2 - 1) * min(80, ln * 0.15) if self.jitter > 0 else 0
        nx, ny = (-dy / ln, dx / ln) if ln > 0 else (0, 0)
        start = now()
        while not self.stopped:
            t = min(1.0, (now() - start) / dur)
            e = t * t * (3 - 2 * t)
            arc = 4 * t * (1 - t) * bend
            move_abs(sx + dx * e + nx * arc, sy + dy * e + ny * arc)
            if t >= 1:
                break
            self.wait(4)

    def move_by(self, dx, dy, dur):
        if dur < 4:
            return move_rel(round(dx), round(dy))
        start, done_x, done_y = now(), 0, 0
        while not self.stopped:
            t = min(1.0, (now() - start) / dur)
            mx, my = round(dx * t - done_x), round(dy * t - done_y)
            move_rel(mx, my)
            done_x += mx
            done_y += my
            if t >= 1:
                break
            self.wait(4)


def close(a, b, tol):
    return all(abs(((a >> sh) & 0xFF) - ((b >> sh) & 0xFF)) <= tol for sh in (0, 8, 16))


def stop_all(reason):
    with sync:
        lst = list(runners.values())
    for r in lst:
        r.stop(reason)


# ------------------------------------------------------------------ comandos
def command(a):
    global monitor, monitor_moves, hotkeys_paused, panic_vk, panic_mods
    c = a[0]
    if c == "ping":
        emit("pong")
    elif c == "quit":
        return False
    elif c == "mon":
        monitor = a[1] == "1"
        monitor_moves = len(a) > 2 and a[2] == "1"
    elif c == "hkpause":
        hotkeys_paused = a[1] == "1"
    elif c == "panic":
        panic_vk = int(a[1])
        panic_mods = int(a[2]) if len(a) > 2 else 0
    elif c == "hk":
        procs = []
        if len(a) > 5:
            for p in a[5].split(","):
                s = p.strip().lower()
                if s.endswith(".exe"):
                    s = s[:-4]
                if s:
                    procs.append(s)
        h = {"id": a[1], "vk": int(a[2]), "mods": int(a[3]), "swallow": a[4] == "1", "down": False, "procs": procs}
        with sync:
            old = hotkeys.get(h["id"])
            if old and old["vk"] == h["vk"]:
                h["down"] = old["down"]  # mantém o estado se o atalho é o mesmo
            hotkeys[h["id"]] = h
        grab(h)
    elif c == "hkdel":
        with sync:
            hotkeys.pop(a[1], None)
        ungrab(a[1])
    elif c == "hkclear":
        with sync:
            ids = list(hotkeys)
            hotkeys.clear()
        for hid in ids:
            ungrab(hid)
    elif c == "run":
        rid = a[1]
        r = Runner(rid, int(a[2]), float(a[3]) / 100.0, parse_steps(a[4] if len(a) > 4 else ""))
        with sync:
            old = runners.get(rid)
            if old:
                old.stop("restart")
            runners[rid] = r
        r.start()
    elif c == "stop":
        with sync:
            r = runners.get(a[1])
        if r:
            r.stop("stop")
    elif c == "stopall":
        stop_all("stop")
    elif c == "pos":
        x, y = cursor_pos()
        emit(f"pos\t{x}\t{y}")
    elif c == "pix":
        px, py = cursor_pos()
        x = int(a[1]) if len(a) > 2 and a[1] != "" else px
        y = int(a[2]) if len(a) > 2 and a[2] != "" else py
        emit(f"pix\t{x}\t{y}\t{pixel(x, y):06x}")
    elif c == "fg":
        emit("fg\t" + foreground_process())
    elif c == "screen":
        emit("screen\t%d\t%d\t%d\t%d" % screen_rect())
    return True


def main():
    threading.Thread(target=record_loop, daemon=True).start()
    threading.Thread(target=grab_drain, daemon=True).start()
    if os.environ.get("WAYLAND_DISPLAY") or os.environ.get("XDG_SESSION_TYPE") == "wayland":
        emit("err\tSessão Wayland: as macros só funcionam nos programas do XWayland. Para funcionar em tudo, entre na sessão Xorg (na tela de login).")
    emit("ready\t%d\t%d\t%d\t%d" % screen_rect())
    for line in sys.stdin:
        line = line.rstrip("\r\n")
        if not line:
            continue
        try:
            if not command(line.split("\t")):
                break
        except Exception as e:  # noqa: BLE001
            emit("err\t" + str(e).replace("\t", " ").replace("\n", " "))
    # stdin fechou (o app saiu): solta tudo o que estiver pressionado e encerra
    stop_all("quit")
    time.sleep(0.05)
    os._exit(0)


if __name__ == "__main__":
    main()
