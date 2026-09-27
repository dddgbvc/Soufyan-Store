"""Synthesises the reel's soundtrack (music bed + sound design) in sync with reel.html.

Everything is generated from code with a fixed seed, so the mix is reproducible.
Writes build/audio.wav (48 kHz, 16-bit stereo, 15.0 s).
"""
import os
import wave

import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
N = int(DUR * SR)
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(20260927)

dry = np.zeros((N, 2))
wet = np.zeros((N, 2))      # reverb send


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[pitch] + 12 * (octave + 1) - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def pan_st(x, pan):
    """Equal-power pan, pan in [-1 (left), 1 (right)]; pan may be an array."""
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


def add(x, t0, gain=1.0, pan=0.0, send=0.0):
    place(dry, x, t0, gain, pan)
    if send:
        place(wet, x, t0, gain * send, pan)


def adsr(n, a, r, sustain_end=None):
    env = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        env[:na] = np.linspace(0, 1, na) ** 1.5
    if nr:
        env[-nr:] *= np.linspace(1, 0, nr) ** 2
    return env


def shaped_noise(dur, centre, width, seed_shift=0):
    """Noise whose spectrum is a moving Gaussian band; centre/width are callables of time (s)."""
    n = int(dur * SR)
    x = rng.standard_normal(n + 2048)
    f, frames, Z = signal.stft(x, SR, nperseg=1024, noverlap=768)
    for j, ft in enumerate(frames):
        c, w = centre(ft), width(ft)
        Z[:, j] *= np.exp(-0.5 * ((np.log2(np.maximum(f, 20)) - np.log2(c)) / w) ** 2)
    _, y = signal.istft(Z, SR, nperseg=1024, noverlap=768)
    y = y[:n]
    return y / (np.abs(y).max() + 1e-9)


# ── Instruments ──────────────────────────────────────────────────────

def saw_voice(freq, dur, cutoff, detune_cents=0.0, drift=None):
    t = tt(dur)
    f = freq * 2 ** (detune_cents / 1200)
    if drift is not None:
        inst = f * drift(t)
        phase = 2 * np.pi * np.cumsum(inst) / SR
    else:
        phase = 2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)
    y = np.zeros_like(t)
    for k in range(1, 20):
        if k * f > 12000:
            break
        y += np.sin(k * phase) / k * np.exp(-(k * f) / cutoff)
    return y


def pad(freqs, dur, cutoff=1400, attack=0.9, release=1.2, drift=None):
    out = np.zeros((int(dur * SR), 2))
    for fq in freqs:
        for cents, p in ((-7, -0.6), (0, 0.0), (7, 0.6)):
            v = saw_voice(fq, dur, cutoff, cents, drift)
            out += pan_st(v, p)
    out *= adsr(len(out), attack, release)[:, None]
    return out / (len(freqs) * 3)


def pluck(freq, dur=1.6, bright=1.0):
    t = tt(dur)
    y = np.zeros_like(t)
    for k in range(1, 8):
        y += np.sin(2 * np.pi * freq * k * t) * (1 / k ** 1.4) * np.exp(-t * (2.2 + k * 1.6 / bright))
    y *= np.minimum(t / 0.003, 1)
    return y


def bell(freq, dur=3.0):
    t = tt(dur)
    y = np.zeros_like(t)
    for ratio, amp, decay in ((1, 1, 1.6), (2.0, 0.45, 1.1), (2.76, 0.35, 0.8), (4.07, 0.2, 0.5), (5.4, 0.12, 0.35)):
        y += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / decay)
    return y * np.minimum(t / 0.002, 1)


def pop(f0=900, f1=420, dur=0.09):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t / 0.018)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.028)


def kick(dur=0.5, amp_tau=0.2):
    t = tt(dur)
    f = 46 + 110 * np.exp(-t / 0.035)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / amp_tau)
    click = rng.standard_normal(len(t)) * np.exp(-t / 0.003) * 0.25
    return y + click


def hat(dur=0.08):
    t = tt(dur)
    x = rng.standard_normal(len(t))
    b, a = signal.butter(4, 7500 / (SR / 2), "high")
    return signal.lfilter(b, a, x) * np.exp(-t / 0.022)


def impact(dur=2.2, f_hi=85, f_lo=34):
    t = tt(dur)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.25)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    body = shaped_noise(dur, lambda s: 180, lambda s: 1.2) * np.exp(-t / 0.12) * 0.5
    air = shaped_noise(dur, lambda s: 5000, lambda s: 1.0) * np.exp(-t / 0.35) * 0.18
    return sub + body + air


def whoosh(dur, f0, f1, peak=0.6, width=0.9):
    """Band-passed noise sweeping f0→f1, swelling to a peak at `peak` (0..1) of its length."""
    t = tt(dur)
    y = shaped_noise(dur, lambda s: f0 * (f1 / f0) ** min(s / dur, 1), lambda s: width)
    x = t / dur
    env = np.where(x < peak, (x / peak) ** 2.2, np.exp(-(x - peak) / (1 - peak) * 4.5))
    return y * env


def sparkle(dur, density, lo=2500, hi=7000):
    out = np.zeros(int(dur * SR))
    for _ in range(int(dur * density)):
        i = rng.integers(0, len(out) - 2400)
        g = tt(0.05)
        f = rng.uniform(lo, hi)
        out[i:i + len(g)] += np.sin(2 * np.pi * f * g) * np.exp(-g / 0.012) * rng.uniform(0.3, 1)
    return out * np.sin(np.pi * np.linspace(0, 1, len(out))) ** 0.7


# ── Score ────────────────────────────────────────────────────────────
BEAT = 0.6                   # 100 BPM grid anchored on the wordmark reveal
GRID0 = 6.3

# Scene A — the old name: a dusty, slightly wobbling A minor pad that tape-stops into the glitch.
def tape(t):
    wob = 1 + 0.004 * np.sin(2 * np.pi * 0.7 * t)
    stop = np.clip((t - 1.95) / 0.5, 0, 1)
    return wob * (1 - 0.75 * stop ** 1.6)

old = pad([note("A2"), note("E3"), note("A3"), note("C4"), note("E4")], 2.6, cutoff=700, attack=0.35, release=0.35, drift=tape)
add(old, 0.0, 0.85, send=0.25)
hiss = shaped_noise(2.6, lambda s: 3500, lambda s: 1.6) * 0.035
crackle = np.zeros(int(2.6 * SR))
for i in rng.integers(0, len(crackle) - 200, 140):
    crackle[i:i + 60] += rng.standard_normal(60) * np.exp(-np.arange(60) / 8) * rng.uniform(0.1, 0.6)
add(hiss + crackle * 0.12, 0.0, 1.0)
add(pluck(note("A3"), 1.2, 0.6), 0.28, 0.25, send=0.4)          # caption
add(whoosh(0.9, 400, 1800, peak=0.35), 0.0, 0.18, pan=0.1)     # name settles in

# Glitch: stepped digital bursts at 15 Hz.
g0, g1 = 2.05, 2.55
for k in range(int((g1 - g0) * 15)):
    if rng.random() < 0.3:
        continue
    d = 1 / 15 * rng.uniform(0.5, 0.95)
    t = tt(d)
    f = rng.choice([220, 330, 660, 990, 1320, 1760])
    sq = np.sign(np.sin(2 * np.pi * f * t))
    nz = np.round(rng.standard_normal(len(t)) * 3) / 3
    y = (sq * 0.5 + nz * 0.5) * np.minimum(1, (d - t) / 0.004)
    add(y, g0 + k / 15, 0.12, pan=rng.uniform(-0.6, 0.6))

# Riser into the wipe, then two whooshes (gold, petrol) travelling right → left.
add(whoosh(0.95, 300, 5000, peak=0.92, width=0.8), 1.6, 0.35)
for start, gain in ((2.46, 0.5), (2.58, 0.55)):
    w = whoosh(0.8, 300, 2400, peak=0.55)
    add(pan_st(w, np.linspace(0.7, -0.7, len(w))), start, gain)

# Scene C — the new identity lands.
add(impact(), 3.35, 0.8, send=0.2)

chords = [
    (3.35, 3.2, ["F2", "C3", "A3", "C4", "E4", "G4"], 1100),
    (6.3, 2.6, ["C3", "G3", "E4", "G4", "B4", "D5"], 1600),
    (8.7, 2.6, ["A2", "E3", "C4", "E4", "G4", "B4"], 1700),
    (11.1, 2.6, ["F2", "C3", "A3", "C4", "E4", "A4"], 1800),
    (13.5, 1.5, ["C3", "G3", "C4", "D4", "E4", "G4"], 1900),
]
for t0, d, notes, cut in chords:
    rel = 1.4 if t0 < 13 else 1.2
    add(pad([note(n) for n in notes], d + 0.5, cutoff=cut, attack=0.5, release=rel), t0 - 0.1, 0.5, send=0.45)

# Bars: a pop as each dot appears, a note as it grows; the gold bar rings like a bell.
bars = [(3.55, "E5"), (3.77, "G5"), (3.99, "C6")]
for i, (t0, n) in enumerate(bars):
    add(pop(1100 + i * 180, 520 + i * 90), t0, 0.35, pan=-0.35 + i * 0.35)
    if i < 2:
        add(pluck(note(n), 1.6, 1.3), t0 + 0.2, 0.24, pan=-0.35 + i * 0.35, send=0.5)
    else:
        add(bell(note(n), 3.0), t0 + 0.2, 0.2, pan=0.35, send=0.7)
add(sparkle(0.9, 40), 4.42, 0.05, send=1.0)                     # shine on the gold bar
for t0, f in ((4.38, note("G6")), (4.62, note("C7"))):          # signal rings
    t = tt(1.4)
    add(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.35), t0, 0.06, send=1.2)

# Zoom-out: reversed swell sucking into the wordmark hit.
sw = whoosh(1.15, 180, 3000, peak=0.97, width=1.0)
add(sw, 5.18, 0.42)
add(impact(1.6, 70, 36), GRID0, 0.55, send=0.2)
add(sparkle(1.2, 55, 3000, 9000), 6.2, 0.07, send=1.0)

# Latin letters: faint ticks, centre outward.
for k in range(12):
    dist = abs(k - 5.5) / 5.5
    t = tt(0.03)
    add(np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.006), 6.95 + dist * 0.3, 0.05, pan=(k - 5.5) / 7)

# Divider + tagline.
add(bell(note("G5"), 2.5) * 0.6 + bell(note("D6"), 2.5) * 0.4, 8.1, 0.14, send=0.8)

# Groove: soft kick on the grid, hats on the off-beats, sub bass under it all.
beats = [GRID0 + k * BEAT for k in range(int((14.2 - GRID0) / BEAT) + 1)]
duck = np.ones(N)
for b in beats:
    add(kick(), b, 0.36)
    i = int(b * SR)
    n = int(0.35 * SR)
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.45 * np.exp(-np.arange(n) / (0.09 * SR)))
for b in beats:
    if b + BEAT / 2 < 14.2 and b >= 7.5:
        add(hat(), b + BEAT / 2, 0.1, pan=0.25)
bass = np.zeros(N)
for t0, d, notes, _ in chords[1:]:
    f = note(notes[0]) / 2 if note(notes[0]) > 100 else note(notes[0])
    t = tt(d + 0.3)
    b = np.sin(2 * np.pi * f * t) * adsr(len(t), 0.05, 0.4)
    i = int(t0 * SR)
    bass[i:i + len(b)] += b[:max(0, min(len(b), N - i))]
dry[:, 0] += bass * duck * 0.13
dry[:, 1] += bass * duck * 0.13

# Soft eighth-note arpeggio over the groove.
for t0, d, notes, _ in chords[1:4]:
    tones = sorted({note(n) * (2 if note(n) < 400 else 1) for n in notes[2:]})
    pattern = [0, 1, 2, 3, 2, 1, 3, 2]
    for k in range(int(d / (BEAT / 2))):
        f = tones[pattern[k % len(pattern)] % len(tones)]
        add(pluck(f, 0.9, 0.9), t0 + k * BEAT / 2, 0.075, pan=0.4 * np.sin(k * 1.3), send=0.55)

# Colourway wipes.
for t0 in (10.5, 11.7, 12.9):
    w = whoosh(0.55, 500, 4000, peak=0.4, width=0.8)
    add(w, t0 - 0.05, 0.28)
    add(pop(700, 300, 0.12), t0, 0.2)

# Final signal wave and resolve.
for i, n in enumerate(["E5", "G5", "C6"]):
    add(pluck(note(n), 2.0, 1.4), 13.5 + i * 0.09, 0.22, pan=-0.35 + i * 0.35, send=0.6)
add(bell(note("C6"), 3.5), 13.9, 0.16, send=0.9)
add(sparkle(0.8, 40), 13.9, 0.05, send=1.0)

# ── Mix ──────────────────────────────────────────────────────────────
# Stereo reverb: decaying, darkened noise impulse response (RT60 ≈ 2.4 s).
ir_t = tt(2.8)
ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t / (2.4 / 6.91))[:, None]
b, a = signal.butter(2, 5000 / (SR / 2))
ir = signal.lfilter(b, a, ir, axis=0)
ir[: int(0.012 * SR)] = 0                              # pre-delay
ir /= np.sqrt((ir ** 2).sum(0))
rev = np.stack([signal.fftconvolve(wet[:, c], ir[:, c])[:N] for c in range(2)], -1)

mix = dry + rev * 0.9
b, a = signal.butter(2, 28 / (SR / 2), "high")         # clear sub-rumble
mix = signal.lfilter(b, a, mix, axis=0)

mix /= np.abs(mix).max()
mix = np.tanh(mix * 1.6) / np.tanh(1.6)                 # gentle saturation / limiting
fade = np.ones(N)
fade[-int(0.6 * SR):] = np.linspace(1, 0, int(0.6 * SR)) ** 2
fade[: int(0.01 * SR)] = np.linspace(0, 1, int(0.01 * SR))
mix *= fade[:, None]
mix *= 10 ** (-1.0 / 20) / np.abs(mix).max()            # peak at -1 dBFS

os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
path = os.path.join(HERE, "build", "audio.wav")
with wave.open(path, "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((mix * 32767).astype("<i2").tobytes())

rms = lambda x: 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)
print(path)
for a0, a1 in ((0, 2), (2, 3.3), (3.3, 6.3), (6.3, 10.5), (10.5, 15)):
    seg = mix[int(a0 * SR):int(a1 * SR)]
    print(f"{a0:5.1f}-{a1:4.1f}s  rms {rms(seg):6.1f} dBFS  peak {20*np.log10(np.abs(seg).max()):5.1f}")
