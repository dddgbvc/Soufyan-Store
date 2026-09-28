#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
python3 audio.py
node render.cjs
node render.cjs --stills 8.4 > /dev/null
python3 -c "from PIL import Image; Image.open('build/still-8.40.png').convert('RGB').save('out/cover.jpg', quality=94)"
