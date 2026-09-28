"""Soundtrack for the WhatsApp order reel: a 120 BPM groove plus sound design,
synced to the timeline in reel.html. Fully synthesised with a fixed seed.

Writes build/audio.wav (48 kHz, 16-bit stereo).
"""
import os
import wave

import numpy as np
from scipy import signal

SR = 48000
DUR = 28.8
N = int(DUR * SR)
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(1047)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
wet = np.zeros((N, 2))

# Timeline (mirrors T in reel.html).
T = dict(
    waIcon=0.1, words=[0.25, 0.5, 0.85, 1.1], underline=1.2, line3=1.45, hookExit=2.2, phoneIn=2.3,
    type1=(2.95, 4.15), send1=4.35, blue1=4.95, dots1=(5.1, 6.25), morph1=5.72, m2=6.25, m3=6.75,
    pop=(7.3, 9.0), type2=(9.05, 9.5), send2=9.65, blue2=10.0, dots2=(10.0, 10.5), m5=10.5,
    zoomOut=(11.0, 11.75), box=11.7, drop=(12.2, 12.65), sideClose=13.25, longClose=13.6,
    tape=(14.1, 14.55), seal=14.75, step2=15.0, jump=15.45, pan=(15.5, 16.2), land=16.3,
    go=16.7, brake=(19.2, 19.9), beep=19.95, hop=(20.1, 20.55), door=20.5, arrived=20.65,
    wipe1=20.95, phone2=21.75, m6=22.25, m7=22.8, stars=22.95, heart=23.55, wipe2=24.0, end=24.75,
)
BEAT = 0.5


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    return 440.0 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


def tt(d):
    return np.arange(int(d * SR)) / SR


def pan_st(x, pan):
    a = (np.asarray(pan) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], -1)


def place(buf, x, t0, gain=1.0, pan=0.0):
    if x.ndim == 1:
        x = pan_st(x, pan)
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if i0 < 0:
        x, i0 = x[-i0:], 0
    n = min(len(x), N - i0)
    buf[i0:i0 + n] += x[:n] * gain


def mus(x, t0, gain=1.0, pan=0.0, send=0.0):
    place(music, x, t0, gain, pan)
    if send:
        place(wet, x, t0, gain * send, pan)


def fx(x, t0, gain=1.0, pan=0.0, send=0.0):
    place(sfx, x, t0, gain, pan)
    if send:
        place(wet, x, t0, gain * send, pan)


def env_ar(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def band_noise(d, centre, width=1.0):
    n = int(d * SR)
    x = rng.standard_normal(n + 2048)
    f, frames, Z = signal.stft(x, SR, nperseg=1024, noverlap=768)
    for j, ft in enumerate(frames):
        c = centre(ft) if callable(centre) else centre
        w = width(ft) if callable(width) else width
        Z[:, j] *= np.exp(-0.5 * ((np.log2(np.maximum(f, 20)) - np.log2(c)) / w) ** 2)
    _, y = signal.istft(Z, SR, nperseg=1024, noverlap=768)
    y = y[:n]
    return y / (np.abs(y).max() + 1e-9)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, "high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def lp(x, fc, order=2):
    sos = signal.butter(order, fc, "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


# ── Instruments ──────────────────────────────────────────────────────
def kick(d=0.45):
    t = tt(d)
    f = 48 + 120 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) + rng.standard_normal(len(t)) * np.exp(-t / 0.002) * 0.2


def clap():
    t = tt(0.3)
    y = np.zeros_like(t)
    nz = hp(rng.standard_normal(len(t)), 900)
    for k, off in enumerate((0, 0.011, 0.022)):
        i = int(off * SR)
        e = np.zeros_like(t)
        e[i:] = np.exp(-(t[i:] - off) / (0.012 if k < 2 else 0.09))
        y += nz * e
    return lp(y, 7000) * 0.8


def hat(d=0.06, tau=0.015):
    t = tt(d)
    return hp(rng.standard_normal(len(t)), 8000, 4) * np.exp(-t / tau)


def shaker():
    t = tt(0.07)
    return hp(rng.standard_normal(len(t)), 5000, 2) * np.sin(np.pi * np.minimum(t / 0.07, 1)) ** 2


def marimba(f, d=0.9):
    t = tt(d)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.35) + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.06)
    return y * np.minimum(t / 0.002, 1)


def pluck(f, d=1.2, bright=1.0):
    t = tt(d)
    y = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.4 * np.exp(-t * (2.5 + k * 1.8 / bright)) for k in range(1, 7))
    return y * np.minimum(t / 0.003, 1)


def bell(f, d=2.0):
    t = tt(d)
    y = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / dc) for r, a, dc in ((1, 1, 1.2), (2.0, .4, .8), (2.76, .3, .6), (4.07, .18, .4), (5.4, .1, .3)))
    return y * np.minimum(t / 0.002, 1)


def bass(f, d):
    t = tt(d)
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.08)
    return np.tanh(1.4 * y) * np.exp(-t / 0.35) * env_ar(len(t), 0.004, 0.03)


def pad(freqs, d, cutoff=1500, a=0.4, r=0.8):
    t = tt(d)
    out = np.zeros((len(t), 2))
    for f in freqs:
        for cents, p in ((-8, -0.6), (0, 0), (8, 0.6)):
            ff = f * 2 ** (cents / 1200)
            ph = 2 * np.pi * ff * t + rng.uniform(0, 6.28)
            v = sum(np.sin(k * ph) / k * np.exp(-(k * ff) / cutoff) for k in range(1, 14) if k * ff < 12000)
            out += pan_st(v, p)
    return out * env_ar(len(t), a, r)[:, None] / (len(freqs) * 3)


def blip(f0, f1, d=0.08, tau=0.03):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / (d * 0.3))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)


def whoosh(d, f0, f1, peak=0.6, width=0.9):
    t = tt(d)
    y = band_noise(d, lambda s: f0 * (f1 / f0) ** min(s / d, 1), width)
    x = t / d
    return y * np.where(x < peak, (x / peak) ** 2.2, np.exp(-(x - peak) / (1 - peak) * 4.5))


def thud(d=0.5, f0=140, f1=55, tau=0.12):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.04)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)
    paper = band_noise(d, 900, 1.2) * np.exp(-t / 0.035) * 0.5
    return body + paper


def impact(d=1.6):
    t = tt(d)
    f = 36 + 60 * np.exp(-t / 0.2)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5) + band_noise(d, 3500, 1.3) * np.exp(-t / 0.25) * 0.25


def sparkle(d, density, lo=2500, hi=8000):
    out = np.zeros(int(d * SR))
    for _ in range(int(d * density)):
        i = rng.integers(0, max(1, len(out) - 2400))
        g = tt(0.05)
        out[i:i + len(g)] += np.sin(2 * np.pi * rng.uniform(lo, hi) * g) * np.exp(-g / 0.012) * rng.uniform(0.3, 1)
    return out * np.sin(np.pi * np.linspace(0, 1, len(out))) ** 0.7


def key_tap():
    t = tt(0.05)
    return hp(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.006) * 0.8 + np.sin(2 * np.pi * rng.uniform(1800, 2400) * t) * np.exp(-t / 0.008) * 0.3


# ── Music: 120 BPM in D major, D – Bm – G – A per bar ────────────────
CHORDS = [("D", ["D3", "F#3", "A3", "D4"], ["D4", "F#4", "A4"]),
          ("B", ["B2", "F#3", "B3", "D4"], ["D4", "F#4", "B4"]),
          ("G", ["G2", "D3", "G3", "B3"], ["D4", "G4", "B4"]),
          ("A", ["A2", "E3", "A3", "C#4"], ["C#4", "E4", "A4"])]
ROOTS = {"D": "D2", "B": "B1", "G": "G1", "A": "A1"}


def chord_at(t):
    return CHORDS[int(t // 2) % 4]


def groove(t0, t1, drums=True, perc=False, gain=1.0, stop=None):
    b = np.arange(np.ceil(t0 / BEAT) * BEAT, t1 - 1e-6, BEAT)
    for x in b:
        if stop and stop[0] <= x < stop[1]:
            continue
        beat = int(round(x / BEAT)) % 4
        name, _, stab = chord_at(x)
        if drums:
            if beat in (0, 2):
                mus(kick(), x, 0.8 * gain)
            if beat in (1, 3):
                mus(clap(), x, 0.32 * gain, pan=0.05, send=0.15)
            mus(hat(), x + BEAT / 2, 0.16 * gain, pan=0.3)
            mus(hat(0.03, 0.008), x, 0.08 * gain, pan=0.3)
            if perc:
                for k in (0.25, 0.75):
                    mus(shaker(), x + BEAT * k, 0.07 * gain, pan=-0.35)
        # bass: root on the beat, octave on the off-beat
        root = note(ROOTS[name])
        mus(bass(root, 0.24), x, 0.42 * gain)
        mus(bass(root * 2, 0.2), x + BEAT / 2, 0.22 * gain)
        # marimba stab on the off-beat of beats 2 and 4, little figure on beat 3
        if beat in (1, 3):
            for k, n in enumerate(stab):
                mus(marimba(note(n)), x + BEAT / 2, 0.11 * gain, pan=-0.3 + k * 0.3, send=0.35)
        if beat == 2:
            mus(marimba(note(stab[-1]) * 2), x + BEAT * 0.75, 0.07 * gain, pan=0.4, send=0.4)


# Intro: pad under the hook words.
mus(pad([note(n) for n in ["D3", "A3", "D4", "F#4"]], 2.6, cutoff=900, a=0.3, r=0.5), 0.0, 0.35, send=0.3)
groove(2.5, 11.0, perc=False)
# transition fill into the packing scene
for k in range(6):
    x = 11.0 + k * 0.125
    mus(clap(), x, 0.1 + k * 0.04, pan=(-1) ** k * 0.2)
mus(whoosh(0.8, 300, 6000, peak=0.95, width=0.8), 10.95, 0.25)
groove(11.75, 20.0, perc=True, stop=(19.9, 20.65))
groove(20.65, 24.0, perc=True)
mus(pad([note(n) for n in ["D3", "A3", "D4", "F#4", "A4"]], 4.3, cutoff=1400, a=0.05, r=1.6), T["end"], 0.45, send=0.5)
groove(T["end"] + 0.25, 27.9, drums=False, gain=0.8)
for x in np.arange(T["end"] + 0.25, 27.9, BEAT):
    mus(hat(), x + BEAT / 2, 0.1, pan=0.3)
    if int(round(x / BEAT)) % 2 == 0:
        mus(kick(), x, 0.45)
# pads for the pop-out lift
mus(pad([note(n) for n in ["D4", "F#4", "A4", "D5"]], 1.9, cutoff=2500, a=0.6, r=0.6), T["pop"][0] - 0.1, 0.25, send=0.6)

# ── Sound design ─────────────────────────────────────────────────────
# Hook
fx(blip(500, 1100, 0.12, 0.05), T["waIcon"], 0.35, send=0.3)
fx(whoosh(0.35, 800, 3000, peak=0.7), T["waIcon"] - 0.2, 0.15)
for i, w0 in enumerate(T["words"]):
    fx(kick(0.3), w0, 0.55)
    fx(pluck(note(["D5", "F#5", "A5", "D6"][i]), 0.8, 1.2), w0, 0.22, pan=(-0.2 + 0.13 * i), send=0.4)
fx(whoosh(0.4, 1500, 6000, peak=0.8, width=0.7), T["underline"], 0.2, pan=-0.2)
fx(bell(note("A5"), 1.5), T["line3"], 0.08, send=0.6)
fx(whoosh(0.55, 300, 2200, peak=0.5), T["hookExit"], 0.3)
fx(thud(0.4, 120, 50, 0.1), 2.75, 0.35)

# Chat: typing, send, ticks, typing indicator, receive
for (a, b), text_len in ((T["type1"], 20), (T["type2"], 23)):
    for k in range(text_len):
        fx(key_tap(), a + (b - a) * k / text_len + rng.uniform(-0.015, 0.015), 0.18 * rng.uniform(0.7, 1), pan=rng.uniform(-0.2, 0.2))
for s in (T["send1"], T["send2"]):
    fx(blip(600, 1400, 0.1, 0.04), s, 0.3, send=0.2)
    fx(whoosh(0.25, 1200, 4000, peak=0.4, width=0.6), s - 0.02, 0.15)
for b in (T["blue1"], T["blue2"]):
    fx(blip(2600, 2600, 0.03, 0.008), b, 0.08)
    fx(blip(3200, 3200, 0.03, 0.008), b + 0.06, 0.08)
for (a, b) in (T["dots1"], T["dots2"]):
    for x in np.arange(a + 0.1, b - 0.1, 0.3):
        fx(blip(900, 700, 0.05, 0.015), x, 0.035, pan=0.3)
for k, n in enumerate(["D5", "F#5", "A5"]):
    fx(pluck(note(n), 0.8, 1.5), T["morph1"] + k * 0.06, 0.16, pan=0.3, send=0.5)
fx(sparkle(0.5, 50), T["morph1"], 0.04, send=1.0)


def receive(t0, gain=0.22):
    fx(bell(note("A5"), 0.9), t0, gain, pan=0.25, send=0.3)
    fx(bell(note("D6"), 0.9), t0 + 0.07, gain * 0.8, pan=0.25, send=0.3)


receive(T["m2"])
receive(T["m3"], 0.16)
fx(whoosh(0.5, 400, 2500, peak=0.4), T["m3"] - 0.1, 0.15)

# Pop-out
fx(whoosh(0.6, 250, 3500, peak=0.45), T["pop"][0] - 0.05, 0.4)
fx(impact(1.0), T["pop"][0] + 0.2, 0.3)
for k in range(3):
    fx(blip(700 + k * 180, 1300 + k * 200, 0.12, 0.05), T["pop"][0] + 0.45 + k * 0.17, 0.3, pan=(0.4, -0.4, 0.4)[k], send=0.3)
fx(sparkle(0.7, 60), T["pop"][0] + 0.55, 0.05, send=1.0)
fx(whoosh(0.5, 2500, 400, peak=0.3), T["pop"][1] - 0.45, 0.3)

# Order confirmed
receive(T["m5"], 0.2)
for k, n in enumerate(["D5", "F#5", "A5", "D6"]):
    fx(pluck(note(n), 1.2, 1.6), T["m5"] + 0.12 + k * 0.07, 0.17, pan=-0.3 + k * 0.2, send=0.6)

# Zoom into the order → packing
fx(whoosh(0.8, 200, 5000, peak=0.85, width=1.0), T["zoomOut"][0], 0.45)
fx(impact(1.4), T["zoomOut"][1], 0.55, send=0.2)
fx(whoosh(0.4, 300, 1200, peak=0.6), T["box"], 0.2)
fx(thud(0.5, 110, 45, 0.15), T["box"] + 0.28, 0.4)
# tracker progress swell + step ping
t_sw = tt(0.5)
fx(np.sin(2 * np.pi * np.cumsum(500 + 700 * (t_sw / 0.5) ** 2) / SR) * np.sin(np.pi * t_sw / 0.5) ** 2, 11.9, 0.05, send=0.4)
fx(bell(note("A5"), 1.2), 12.4, 0.1, send=0.5)

# Items fall in and land
for k, d0 in enumerate(T["drop"]):
    tw = tt(0.3)
    fall = np.sin(2 * np.pi * np.cumsum(2200 - 1500 * tw / 0.3) / SR) * (tw / 0.3) * 0.5
    fx(fall, d0, 0.06, pan=(-0.2, 0.2)[k])
    fx(thud(0.5, 150, 60, 0.1), d0 + 0.3, 0.5, pan=(-0.2, 0.2)[k])
# Flaps
for k, (s, delay) in enumerate(((T["sideClose"], 0), (T["sideClose"], 0.08), (T["longClose"], 0), (T["longClose"], 0.1))):
    fx(whoosh(0.32, 500, 1800, peak=0.8, width=0.8), s + delay, 0.18, pan=(-0.4, 0.4)[k % 2])
    fx(thud(0.3, 200, 90, 0.05), s + delay + 0.32, 0.3, pan=(-0.4, 0.4)[k % 2])
# Tape rip
tr = T["tape"][1] - T["tape"][0] + 0.1
t_tape = tt(tr)
rip = band_noise(tr, lambda s: 1500 + 2500 * s / tr, 0.9) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 38 * t_tape)))
fx(rip * env_ar(len(t_tape), 0.02, 0.05), T["tape"][0], 0.3, pan=np.linspace(-0.5, 0.5, len(t_tape)))
fx(blip(1800, 900, 0.06, 0.015), T["tape"][1] + 0.05, 0.2)
# Warranty seal slap
t_sl = tt(0.3)
fx(hp(rng.standard_normal(len(t_sl)), 1200) * np.exp(-t_sl / 0.01) * 0.9 + thud(0.3, 180, 70, 0.06)[:len(t_sl)], T["seal"] + 0.05, 0.5, pan=0.3)
fx(bell(note("D6"), 1.0), T["step2"], 0.1, send=0.5)
t_sw = tt(0.45)
fx(np.sin(2 * np.pi * np.cumsum(500 + 700 * (t_sw / 0.45) ** 2) / SR) * np.sin(np.pi * t_sw / 0.45) ** 2, T["step2"] + 0.1, 0.05, send=0.4)

# Jump onto the scooter (cartoon boing)
t_j = tt(0.45)
fx(np.sin(2 * np.pi * np.cumsum(250 + 500 * (t_j / 0.45)) / SR) * np.exp(-t_j / 0.25) * (1 + 0.3 * np.sin(2 * np.pi * 18 * t_j)), T["jump"], 0.2, send=0.2)
fx(whoosh(0.8, 300, 2500, peak=0.5), T["pan"][0], 0.35, pan=np.linspace(0.6, -0.6, int(0.8 * SR)))
fx(thud(0.4, 160, 70, 0.08), T["land"] + 0.05, 0.4)
t_b = tt(0.35)
fx(np.sin(2 * np.pi * 180 * t_b * (1 + 0.2 * np.sin(2 * np.pi * 14 * t_b))) * np.exp(-t_b / 0.12), T["land"] + 0.07, 0.12)

# Engine: fundamental follows the scooter speed.
VMAX = 1500


def ease_sine(x):
    return -(np.cos(np.pi * np.clip(x, 0, 1)) - 1) / 2


t_e0, t_e1 = T["go"] - 0.35, T["arrived"] + 0.2
te = t_e0 + tt(t_e1 - t_e0)
spd = VMAX * ease_sine((te - T["go"]) / 0.6) * (1 - ease_sine((te - T["brake"][0]) / (T["brake"][1] - T["brake"][0])))
f0 = 34 + spd * 0.05
rev = np.exp(-((te - T["go"] + 0.15) / 0.12) ** 2) * 25        # starter rev blip
ph = 2 * np.pi * np.cumsum(f0 + rev) / SR
eng = sum(np.sin(k * ph + rng.uniform(0, 6)) / k ** 0.9 for k in range(1, 12))
eng *= 1 + 0.25 * np.sin(ph * 0.5)
eng = lp(np.tanh(eng * 0.8), 1600)
level = 0.35 + 0.65 * spd / VMAX
level *= np.clip((te - t_e0) / 0.1, 0, 1) * np.clip((t_e1 - te) / 0.4, 0, 1)
fx(eng * level, t_e0, 0.1, pan=0.1)
wind = band_noise(t_e1 - t_e0, 900, 1.4) * (spd / VMAX) ** 1.5
fx(wind, t_e0, 0.1)
for k in range(5):                                              # palms passing
    fx(whoosh(0.35, 600, 2000, peak=0.5), 17.4 + k * 0.42, 0.06, pan=np.linspace(-0.7, 0.7, int(0.35 * SR)))
t_sq = tt(0.35)
fx(np.sin(2 * np.pi * 2300 * t_sq * (1 + 0.01 * np.sin(2 * np.pi * 30 * t_sq))) * np.sin(np.pi * t_sq / 0.35), T["brake"][1] - 0.3, 0.025)

# Horn: "بيب بيب"
for k in range(2):
    t_h = tt(0.16)
    horn = np.sign(np.sin(2 * np.pi * 415 * t_h)) * 0.5 + np.sign(np.sin(2 * np.pi * 523 * t_h)) * 0.5
    fx(lp(horn, 2500) * env_ar(len(t_h), 0.005, 0.03), T["beep"] + k * 0.22, 0.14)

# Box hop, doorbell, door, confetti popper
fx(whoosh(0.45, 500, 1800, peak=0.5), T["hop"][0], 0.2, pan=np.linspace(0.3, -0.5, int(0.45 * SR)))
fx(thud(0.4, 140, 60, 0.08), T["hop"][1], 0.4, pan=-0.4)
fx(bell(note("E5"), 1.6), T["door"] - 0.05, 0.2, pan=-0.4, send=0.5)
fx(bell(note("C5"), 1.8), T["door"] + 0.3, 0.2, pan=-0.4, send=0.5)
t_p = tt(0.6)
pop_ = hp(rng.standard_normal(len(t_p)), 700) * np.exp(-t_p / 0.02)
crackle = np.zeros(len(t_p))
for i in rng.integers(0, len(t_p) - 300, 40):
    crackle[i:i + 200] += rng.standard_normal(200) * np.exp(-np.arange(200) / 30) * 0.4
fx(pop_ + crackle, T["arrived"], 0.4, send=0.3)
for k, n in enumerate(["D5", "F#5", "A5", "D6"]):
    fx(pluck(note(n), 1.4, 1.6), T["arrived"] + k * 0.05, 0.18, pan=-0.3 + k * 0.2, send=0.6)
fx(sparkle(1.0, 50), T["arrived"], 0.05, send=1.0)

# Back to the chat: wipe, receive, rating, heart
fx(whoosh(0.7, 300, 3000, peak=0.6), T["wipe1"], 0.4, pan=np.linspace(0.6, -0.6, int(0.7 * SR)))
fx(impact(1.2), T["wipe1"] + 0.85, 0.4)
fx(whoosh(0.5, 300, 1500, peak=0.6), T["phone2"], 0.2)
receive(T["m6"])
fx(blip(600, 1400, 0.1, 0.04), T["m7"], 0.3, send=0.2)
for k, n in enumerate(["D5", "E5", "F#5", "A5", "D6"]):
    fx(pluck(note(n), 1.0, 1.6), T["stars"] + k * 0.12, 0.2, pan=0.3 - k * 0.15, send=0.6)
fx(pop_ + crackle, T["stars"] + 0.55, 0.35, send=0.3)
fx(blip(900, 1600, 0.14, 0.06), T["heart"], 0.3, send=0.3)

# End card
fx(whoosh(0.7, 250, 3500, peak=0.9), T["wipe2"], 0.35)
fx(whoosh(0.6, 3500, 400, peak=0.2), T["wipe2"] + 0.7, 0.3)
fx(impact(2.0), T["end"], 0.6, send=0.3)
for k, n in enumerate(["D5", "F#5", "A5"]):
    fx(pluck(note(n), 1.4, 1.5), T["end"] + k * 0.12, 0.2, send=0.6)
fx(sparkle(1.2, 50), T["end"] + 0.4, 0.05, send=1.0)
fx(bell(note("A5"), 1.5), T["end"] + 1.2, 0.08, send=0.6)
fx(blip(500, 1100, 0.14, 0.06), T["end"] + 1.6, 0.3, send=0.3)
fx(sparkle(0.6, 60), T["end"] + 2.3, 0.05, send=1.0)
for k in range(13):
    fx(key_tap(), T["end"] + 2.0 + k * 0.7 / 13, 0.12)
fx(blip(1400, 900, 0.06, 0.02), T["end"] + 2.9, 0.25)
for k, n in enumerate(["D5", "F#5", "A5"]):
    fx(pluck(note(n), 1.6, 1.5), T["end"] + 2.5 + k * 0.09, 0.16, send=0.6)
fx(bell(note("D6"), 2.5), T["end"] + 2.9, 0.12, send=0.8)

# ── Mix ──────────────────────────────────────────────────────────────
ir_t = tt(2.2)
ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t / (2.0 / 6.91))[:, None]
ir = lp(ir, 6000)
ir[: int(0.015 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(0))
rev = np.stack([signal.fftconvolve(wet[:, c], ir[:, c])[:N] for c in range(2)], -1)

# Duck the music under the sound design a little.
env = np.abs(sfx).max(1)
env = signal.lfilter([1 - np.exp(-1 / (0.08 * SR))], [1, -np.exp(-1 / (0.08 * SR))], env)
duck = 1 - 0.35 * np.clip(env / (np.percentile(env, 99) + 1e-9), 0, 1)
mix = music * 0.8 * duck[:, None] + sfx + rev * 0.7
mix = hp(mix, 30)
mix /= np.abs(mix).max()
mix = np.tanh(mix * 1.8) / np.tanh(1.8)
fade = np.ones(N)
fade[-int(0.8 * SR):] = np.linspace(1, 0, int(0.8 * SR)) ** 2
fade[: int(0.01 * SR)] = np.linspace(0, 1, int(0.01 * SR))
mix *= fade[:, None]
mix *= 10 ** (-1.0 / 20) / np.abs(mix).max()

os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
path = os.path.join(HERE, "build", "audio.wav")
with wave.open(path, "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((mix * 32767).astype("<i2").tobytes())

rms = lambda x: 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)
print(path)
for a0, a1 in ((0, 2.5), (2.5, 7.3), (7.3, 11), (11, 16.5), (16.5, 20.7), (20.7, 24.7), (24.7, DUR)):
    seg = mix[int(a0 * SR):int(a1 * SR)]
    print(f"{a0:5.1f}-{a1:4.1f}s  rms {rms(seg):6.1f} dBFS  peak {20*np.log10(np.abs(seg).max()):5.1f}")
