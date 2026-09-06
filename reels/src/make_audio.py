#!/usr/bin/env python3
"""
Soufyan Mobile reel soundtrack — fully synthesised, no sampled/licensed material.
120 BPM, 25.0 s, D Hijaz (D Eb F# G A Bb C) for an Arabic colour.
Scene cuts land on beats: 0.0 / 3.5 / 7.5 / 12.5 / 17.0 / 21.0
"""
import numpy as np
import wave, struct

SR   = 48000
DUR  = 25.0
BPM  = 120.0
BEAT = 60.0 / BPM          # 0.5 s
N    = int(SR * DUR)
t    = np.arange(N) / SR

CUTS = [3.5, 7.5, 12.5, 17.0, 21.0]

L = np.zeros(N)
R = np.zeros(N)


def add(buf, start, sig, gain=1.0):
    i = int(start * SR)
    if i >= len(buf) or i < 0:
        return
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n] * gain


def env(n, a, d, s=0.0, r=0.0, sus=0.0):
    """Simple ADSR over n samples (times in seconds)."""
    e = np.zeros(n)
    ai, di, si, ri = (int(x * SR) for x in (a, d, sus, r))
    p = 0
    if ai:
        k = min(ai, n - p); e[p:p + k] = np.linspace(0, 1, k); p += k
    if di and p < n:
        k = min(di, n - p); e[p:p + k] = np.linspace(1, s, k); p += k
    if si and p < n:
        k = min(si, n - p); e[p:p + k] = s; p += k
    if ri and p < n:
        k = min(ri, n - p); e[p:p + k] = np.linspace(s, 0, k); p += k
    return e


def expdec(n, tau):
    return np.exp(-np.arange(n) / (SR * tau))


def lowpass(x, cutoff):
    """One-pole low-pass."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


# ---------------------------------------------------------------- instruments
def kick(vel=1.0):
    n = int(0.30 * SR)
    k = np.arange(n) / SR
    f = 48 + 105 * np.exp(-k / 0.022)              # pitch drop
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * expdec(n, 0.075)
    click = np.random.default_rng(7).normal(0, 1, n) * expdec(n, 0.0022) * 0.28
    return (body + click) * vel


def hat(vel=1.0, open_=False):
    tau = 0.055 if open_ else 0.018
    n = int((0.20 if open_ else 0.07) * SR)
    rng = np.random.default_rng(int(vel * 9871) % 9999)
    s = rng.normal(0, 1, n) * expdec(n, tau)
    return highpass(s, 6500) * 0.16 * vel


def clap():
    n = int(0.26 * SR)
    rng = np.random.default_rng(31)
    s = np.zeros(n)
    for off, g in ((0, .6), (0.011, .8), (0.021, 1.0)):     # 3 stacked bursts
        i = int(off * SR)
        b = rng.normal(0, 1, n - i) * expdec(n - i, 0.014) * g
        s[i:] += b
    s += rng.normal(0, 1, n) * expdec(n, 0.085) * 0.30      # short tail
    return lowpass(highpass(s, 1100), 7200) * 0.30


def bass(freq, dur, vel=1.0):
    n = int(dur * SR)
    k = np.arange(n) / SR
    w = (np.sin(2 * np.pi * freq * k)
         + 0.30 * np.sin(2 * np.pi * 2 * freq * k)
         + 0.12 * np.sin(2 * np.pi * 3 * freq * k))
    e = env(n, 0.008, 0.10, 0.62, 0.10, sus=max(0, dur - 0.22))
    return lowpass(w * e, 320) * 0.42 * vel


def pluck(freq, dur, vel=1.0):
    n = int(dur * SR)
    k = np.arange(n) / SR
    w = (np.sin(2 * np.pi * freq * k)
         + 0.42 * np.sin(2 * np.pi * 2 * freq * k) * expdec(n, 0.10)
         + 0.18 * np.sin(2 * np.pi * 3 * freq * k) * expdec(n, 0.05))
    return w * env(n, 0.004, 0.16, 0.35, 0.30, sus=max(0, dur - 0.47)) * 0.20 * vel


def pad(freqs, dur, vel=1.0):
    n = int(dur * SR)
    k = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.16, 0.0, 0.16):                      # gentle detune
            s += np.sin(2 * np.pi * (f + det) * k + np.random.default_rng(int(f)).random())
    s /= (len(freqs) * 3)
    a = min(0.9, dur * 0.35)
    return lowpass(s, 1500) * env(n, a, 0.4, 0.75, min(1.4, dur * 0.4),
                                  sus=max(0, dur - a - 0.4 - 1.4)) * 0.30 * vel


def tick(freq=1244.5):
    """Soft transition shimmer — a bell, not a beep. Deliberately gentle."""
    n = int(1.1 * SR)
    k = np.arange(n) / SR
    s = np.zeros(n)
    for h, g, tau in ((1, 1.0, 0.34), (2.76, 0.42, 0.20), (5.4, 0.16, 0.11)):
        s += g * np.sin(2 * np.pi * freq * h * k) * expdec(n, tau)
    return s * env(n, 0.004, 1.0, 0.0, 0.0) * 0.16


def swell(dur=1.0):
    """Reverse noise rise into a cut."""
    n = int(dur * SR)
    rng = np.random.default_rng(5)
    s = rng.normal(0, 1, n) * np.linspace(0, 1, n) ** 2.6
    return lowpass(highpass(s, 900), 5200) * 0.16


# ---------------------------------------------------------------- note tables
D2, A2, Bb2, G2 = 73.42, 110.00, 116.54, 98.00
D4, Eb4, Fs4, G4, A4, Bb4, C5, D5 = 293.66, 311.13, 369.99, 392.00, 440.00, 466.16, 523.25, 587.33

MONO = np.zeros(N)

# ---- drums -------------------------------------------------------------
nbeats = int(DUR / BEAT)                       # 50 beats
for b in range(nbeats):
    tb = b * BEAT
    bar_beat = b % 4

    breakdown = 17.0 <= tb < 21.0               # "care" scene: pull back, don't drop out
    if tb >= 3.5:
        if breakdown:
            if bar_beat == 0:                   # heartbeat kick keeps the pulse alive
                add(MONO, tb, kick(0.62))
        else:
            if bar_beat in (0, 2):
                add(MONO, tb, kick(1.0 if bar_beat == 0 else 0.86))
            if bar_beat == 2:
                add(MONO, tb, clap())
            if bar_beat == 3:                   # syncopated push into the next bar
                add(MONO, tb + BEAT * 0.75, kick(0.55))

    # hats: from the intro onward, thinner during the breakdown
    if tb >= 1.0:
        hv = 0.45 if (17.0 <= tb < 21.0) else 1.0
        for sub in range(4):                    # 16ths
            ts = tb + sub * BEAT / 4
            if ts >= DUR:
                break
            v = (1.0 if sub == 0 else 0.55 if sub == 2 else 0.38) * hv
            add(MONO, ts, hat(v, open_=(bar_beat == 3 and sub == 2)))

# ---- bass --------------------------------------------------------------
BASS = [(D2, 2.0), (D2, 2.0), (Bb2, 2.0), (A2, 2.0)]
tb = 3.5
i = 0
while tb < DUR:
    f, d = BASS[i % len(BASS)]
    vel = 0.55 if (17.0 <= tb < 21.0) else 1.0  # softer, not absent, in the breakdown
    add(MONO, tb, bass(f, min(d, DUR - tb), vel))
    tb += d
    i += 1

# ---- pad ---------------------------------------------------------------
add(MONO, 0.0,  pad([D4, A4, D5], 4.6, 1.15))
add(MONO, 7.5,  pad([D4, Fs4, A4], 5.4, 0.60))
add(MONO, 12.5, pad([Bb2 * 2, D4, G4], 4.9, 0.60))
add(MONO, 17.0, pad([D4, A4, D5], 4.4, 1.65))   # breakdown: pad carries it
add(MONO, 21.0, pad([D4, Fs4, A4, D5], 4.0, 0.85))

# ---- melody (D Hijaz) --------------------------------------------------
MEL = [
    (7.50, D4, .5), (8.00, Eb4, .5), (8.50, Fs4, 1.0), (9.50, A4, .5),
    (10.00, G4, .5), (10.50, Fs4, 1.0), (11.50, Eb4, .5), (12.00, D4, .5),
    (12.50, A4, .5), (13.00, Bb4, .5), (13.50, A4, 1.0), (14.50, Fs4, .5),
    (15.00, G4, .5), (15.50, A4, 1.0), (16.50, Fs4, .5),
    # breakdown: sparse, warm — space to read the promise lines
    (17.00, A4, 1.5), (19.00, G4, 1.0), (20.00, Fs4, 1.0),
    (21.00, D5, .5), (21.50, C5, .5), (22.00, Bb4, 1.0), (23.00, A4, .5),
    (23.50, Fs4, .5), (24.00, D4, 1.0),
]
for ts, f, d in MEL:
    add(MONO, ts, pluck(f, d + 0.25, 1.0))

# ---- transition accents ------------------------------------------------
for c in CUTS:
    add(MONO, c, tick(1244.5 if c not in (17.0,) else 932.3))
    add(MONO, c - 1.0, swell(1.0))

# ---------------------------------------------------------------- mixdown
# gentle stereo width: hats/melody spread, low end kept centred
wide = highpass(MONO, 700)
L = MONO + 0.16 * np.roll(wide, 11)
R = MONO + 0.16 * np.roll(wide, -11)

# global fades so nothing clicks at the edges
fade_in  = np.clip(t / 0.35, 0, 1)
fade_out = np.clip((DUR - t) / 0.9, 0, 1) ** 1.4
for ch in (L, R):
    ch *= fade_in * fade_out

peak = max(np.abs(L).max(), np.abs(R).max())
L *= 0.72 / peak
R *= 0.72 / peak
L = np.tanh(L * 1.15) * 0.92          # soft limit — keeps it warm, never harsh
R = np.tanh(R * 1.15) * 0.92

data = np.empty(N * 2)
data[0::2] = L
data[1::2] = R
pcm = np.clip(data, -1, 1)
pcm = (pcm * 32767).astype('<i2')

with wave.open('build/soundtrack.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

print(f'wrote build/soundtrack.wav  {DUR}s  peak={max(abs(L).max(), abs(R).max()):.3f}')
