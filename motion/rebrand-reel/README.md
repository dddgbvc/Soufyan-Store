# ريلز التحوّل: مركز الحويش ← مكتب سفيان للموبايل

- `out/sufyan-rebrand-reel.mp4` — the reel (1080×1920, 30 fps, 15 s, H.264 + AAC)
- `out/cover.jpg` — cover frame for the reel

## Storyboard

| Time | Scene |
|---|---|
| 0.0 – 2.0 s | «كنّا» ← the old name «مركز الحويش» (taken from the original poster) over its own backdrop, with the lettering removed and the image blurred |
| 2.0 – 2.5 s | The old name glitches like a lost signal |
| 2.5 – 3.3 s | Three capsules, the shape of the logo's bars, sweep in from right to left (gold, then petrol) |
| 3.4 – 5.2 s | «واليوم صرنا» ← the bars appear one after another, and the third (gold) one glows and sends out signal rings |
| 5.2 – 6.3 s | The full-screen petrol background shrinks into the logo's rounded square |
| 6.2 – 8.2 s | «مكتب سفيان للموبايل» appears word by word from right to left, then SUFYAN MOBILE tightens its letter spacing |
| 8.1 – 10.5 s | Gold divider and «نفس الثقة.. بهويّة جديدة» |
| 10.5 – 13.4 s | The official colourways (reversed ← aqua ← primary) replace each other through circles opening from the icon |
| 13.5 – 15.0 s | One last "signal" wave across the bars, then the end shot |

The logo's proportions come from the master file: bar width 10.1% of the square, a gap of 5.5%, bar heights of 18.5, 27.2 and 36% of the square, and a corner radius of 27.4%. The colours come from the brand sheet: sand `#F2EEE3`, petrol `#14343F`, gold `#C8A969`, aqua `#2F6F6B`.

## Rebuild

Requires Python 3 (`pillow numpy scipy imageio-ffmpeg`) and Node with Playwright (Chromium).

```sh
./build.sh
```

- `prepare_assets.py` extracts transparent layers from the two source images into `assets/`
- `audio.py` generates the music and sound effects → `build/audio.wav`
- `reel.html` is the animation; open it in a browser for a live preview
- `render.cjs` renders the frames with 8-sample motion blur and encodes the MP4
