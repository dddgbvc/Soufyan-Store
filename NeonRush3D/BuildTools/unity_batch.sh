#!/usr/bin/env bash
# NEON RUSH — Unity batch-mode helper (macOS / Linux).
#
#   BuildTools/unity_batch.sh setup     # configure URP + iOS settings, generate scene, validate
#   BuildTools/unity_batch.sh test      # EditMode + PlayMode tests → Builds/TestResults-*.xml
#   BuildTools/unity_batch.sh xcode     # export the iOS Xcode project → Builds/iOS/Xcode
#   BuildTools/unity_batch.sh all       # setup + test + xcode (+ IPA on macOS via make_ipa.sh)
#
# UNITY_PATH can point at the editor binary; otherwise the Unity Hub default for 2022.3.62f1 is used.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJ="$(cd "$HERE/.." && pwd)"
VER="$(sed -n 's/^m_EditorVersion: //p' "$PROJ/ProjectSettings/ProjectVersion.txt")"
if [[ -z "${UNITY_PATH:-}" ]]; then
  if [[ "$(uname)" == "Darwin" ]]; then UNITY_PATH="/Applications/Unity/Hub/Editor/$VER/Unity.app/Contents/MacOS/Unity"
  else UNITY_PATH="$HOME/Unity/Hub/Editor/$VER/Editor/Unity"; fi
fi
[[ -x "$UNITY_PATH" ]] || { echo "Unity $VER not found at $UNITY_PATH (set UNITY_PATH)." >&2; exit 1; }
mkdir -p "$PROJ/Builds"

setup() {
  "$UNITY_PATH" -batchmode -quit -projectPath "$PROJ" -executeMethod NeonRush.EditorTools.NeonRushBuild.SetupCommandLine \
    -logFile "$PROJ/Builds/unity-setup.log"
  echo "setup OK (log: Builds/unity-setup.log)"
}

test_mode() {
  local mode="$1"
  set +e
  "$UNITY_PATH" -batchmode -projectPath "$PROJ" -runTests -testPlatform "$mode" \
    -testResults "$PROJ/Builds/TestResults-$mode.xml" -logFile "$PROJ/Builds/unity-tests-$mode.log"
  local code=$?
  set -e
  python3 - "$PROJ/Builds/TestResults-$mode.xml" <<'PY' || true
import sys, xml.etree.ElementTree as ET
r = ET.parse(sys.argv[1]).getroot()
print(f"{sys.argv[1]}: total={r.get('total')} passed={r.get('passed')} failed={r.get('failed')} skipped={r.get('skipped')}")
for t in r.iter('test-case'):
    if t.get('result') != 'Passed':
        print('  FAIL', t.get('fullname'))
PY
  return $code
}

xcode() {
  "$UNITY_PATH" -batchmode -quit -projectPath "$PROJ" -buildTarget iOS \
    -executeMethod NeonRush.EditorTools.NeonRushBuild.BuildIOSCommandLine -customBuildPath "$PROJ/Builds/iOS/Xcode" \
    -logFile "$PROJ/Builds/unity-ios-build.log"
  echo "Xcode project: $PROJ/Builds/iOS/Xcode"
}

case "${1:-all}" in
  setup) setup ;;
  test) test_mode EditMode; test_mode PlayMode ;;
  xcode) xcode ;;
  all)
    setup
    test_mode EditMode
    test_mode PlayMode
    xcode
    if [[ "$(uname)" == "Darwin" ]]; then "$HERE/make_ipa.sh" "$PROJ/Builds/iOS/Xcode"; fi ;;
  *) echo "usage: $0 setup|test|xcode|all" >&2; exit 2 ;;
esac
