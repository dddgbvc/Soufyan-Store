#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
python3 prepare_assets.py > /dev/null
python3 audio.py
node render.cjs
node render.cjs --stills 14.5 > /dev/null
python3 -c "from PIL import Image; Image.open('build/still-14.50.png').convert('RGB').save('out/cover.jpg', quality=94)"
