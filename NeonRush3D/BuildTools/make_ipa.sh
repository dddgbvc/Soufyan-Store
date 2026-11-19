#!/usr/bin/env bash
# NEON RUSH — Xcode project → IPA (macOS + Xcode only).
#
#   BuildTools/make_ipa.sh [path/to/UnityXcodeExport]
#
# Without signing variables it produces an UNSIGNED IPA (Payload/Neon Rush.app zipped),
# which is what ESign / similar tools expect as input before re-signing on device.
#
# Optional signing (all four needed; never commit these files or the password):
#   NR_P12_PATH            path to the .p12 certificate + private key
#   NR_P12_PASSWORD        its password (pass via environment / CI secret, not on the command line)
#   NR_PROFILE_PATH        path to the .mobileprovision
#   NR_EXPORT_METHOD       development | ad-hoc | enterprise | app-store   (default: ad-hoc)
#
# Output: Builds/iOS/NeonRush-iOS-v1.0.0.ipa
set -euo pipefail

BUNDLE_ID="${NR_BUNDLE_ID:-com.sufyan.neonrush}"
VERSION="${NR_VERSION:-1.0.0}"
BUILD_NUMBER="${NR_BUILD:-1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$HERE/.." && pwd)"
XCODE_DIR="${1:-$PROJECT_ROOT/Builds/iOS/Xcode}"
OUT_DIR="$PROJECT_ROOT/Builds/iOS"
WORK="$OUT_DIR/work"
ARCHIVE="$WORK/NeonRush.xcarchive"
IPA_NAME="${NR_IPA_NAME:-NeonRush-iOS-v${VERSION}.ipa}"
IPA="$OUT_DIR/$IPA_NAME"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ "$(uname)" == "Darwin" ]] || die "IPA creation needs macOS with Xcode (xcodebuild). This machine is $(uname)."
command -v xcodebuild >/dev/null || die "xcodebuild not found. Install Xcode and run: sudo xcode-select -s /Applications/Xcode.app"
[[ -d "$XCODE_DIR/Unity-iPhone.xcodeproj" ]] || die "Unity Xcode export not found at $XCODE_DIR (run NeonRush › 4. Export iOS Xcode Project first)."

rm -rf "$WORK" && mkdir -p "$WORK"
xcodebuild -version

archive_unsigned() {
  xcodebuild -project "$XCODE_DIR/Unity-iPhone.xcodeproj" -scheme Unity-iPhone -configuration Release \
    -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" CODE_SIGN_ENTITLEMENTS="" \
    archive > "$WORK/archive.log" 2>&1 || { tail -40 "$WORK/archive.log"; die "xcodebuild archive failed. Full log: $WORK/archive.log"; }
  ls -d "$ARCHIVE/Products/Applications/"*.app >/dev/null 2>&1 || die "Archive has no .app. See $WORK/archive.log"
  echo "Archive OK: $ARCHIVE"
}

SIGNED=0
if [[ -n "${NR_P12_PATH:-}" || -n "${NR_PROFILE_PATH:-}" ]]; then
  [[ -f "${NR_P12_PATH:-}" ]] || die "NR_P12_PATH is set but the file does not exist."
  [[ -f "${NR_PROFILE_PATH:-}" ]] || die "NR_PROFILE_PATH is set but the file does not exist."
  [[ -n "${NR_P12_PASSWORD+x}" ]] || die "NR_P12_PASSWORD must be provided via the environment."
  SIGNED=1
fi

if [[ $SIGNED -eq 1 ]]; then
  METHOD="${NR_EXPORT_METHOD:-ad-hoc}"
  PROFILE_PLIST="$WORK/profile.plist"
  security cms -D -i "$NR_PROFILE_PATH" > "$PROFILE_PLIST"
  PROFILE_UUID=$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$PROFILE_PLIST")
  PROFILE_NAME=$(/usr/libexec/PlistBuddy -c 'Print :Name' "$PROFILE_PLIST")
  TEAM_ID=$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$PROFILE_PLIST")
  APP_ID=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$PROFILE_PLIST")
  PROFILE_BUNDLE="${APP_ID#*.}"
  EXPIRES=$(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$PROFILE_PLIST")
  echo "Profile: $PROFILE_NAME ($PROFILE_UUID), team $TEAM_ID, app id $APP_ID, expires $EXPIRES"

  # The bundle id is never changed to fit a profile: the profile must match it (or be a wildcard).
  if [[ "$PROFILE_BUNDLE" != "$BUNDLE_ID" && "$PROFILE_BUNDLE" != "*" ]]; then
    if [[ "$PROFILE_BUNDLE" == *"*" && "$BUNDLE_ID" == "${PROFILE_BUNDLE%\*}"* ]]; then
      echo "Wildcard profile $PROFILE_BUNDLE covers $BUNDLE_ID."
    else
      die "Provisioning profile is for '$PROFILE_BUNDLE', app is '$BUNDLE_ID'. Use a matching profile."
    fi
  fi

  KEYCHAIN="$WORK/neonrush-signing.keychain-db"
  KC_PASS="$(uuidgen)"
  security create-keychain -p "$KC_PASS" "$KEYCHAIN"
  security set-keychain-settings -lut 3600 "$KEYCHAIN"
  security unlock-keychain -p "$KC_PASS" "$KEYCHAIN"
  security import "$NR_P12_PATH" -k "$KEYCHAIN" -P "$NR_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
  security set-key-partition-list -S apple-tool:,apple: -s -k "$KC_PASS" "$KEYCHAIN" >/dev/null
  ORIGINAL_KEYCHAINS=$(security list-keychains -d user | tr -d '"')
  security list-keychains -d user -s "$KEYCHAIN" $ORIGINAL_KEYCHAINS
  cleanup() { security list-keychains -d user -s $ORIGINAL_KEYCHAINS || true; security delete-keychain "$KEYCHAIN" || true; }
  trap cleanup EXIT

  IDENTITY=$(security find-identity -v -p codesigning "$KEYCHAIN" | awk -F'"' 'NR==1{print $2}')
  [[ -n "$IDENTITY" ]] || die "No code-signing identity found in the .p12."
  echo "Signing identity: $IDENTITY"

  mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
  cp "$NR_PROFILE_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"

  # The archive is built unsigned (Unity's UnityFramework target rejects provisioning
  # profiles); -exportArchive below signs the app with the given certificate + profile.
  archive_unsigned
  cat > "$WORK/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>${METHOD}</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>${IDENTITY}</string>
  <key>provisioningProfiles</key><dict><key>${BUNDLE_ID}</key><string>${PROFILE_UUID}</string></dict>
  <key>compileBitcode</key><false/>
  <key>stripSwiftSymbols</key><true/>
  <key>thinning</key><string>&lt;none&gt;</string>
</dict></plist>
PLIST
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$WORK/export" \
    -exportOptionsPlist "$WORK/ExportOptions.plist" | tee "$WORK/export.log" | tail -5
  EXPORTED=$(ls "$WORK/export"/*.ipa 2>/dev/null | head -1)
  [[ -n "$EXPORTED" ]] || die "Export failed. See $WORK/export.log"
  mv "$EXPORTED" "$IPA"
else
  echo "No signing variables: building an UNSIGNED IPA (for ESign or later re-signing)."
  archive_unsigned
  APP=$(ls -d "$ARCHIVE/Products/Applications/"*.app | head -1)
  rm -rf "$WORK/Payload" && mkdir -p "$WORK/Payload"
  cp -R "$APP" "$WORK/Payload/"
  (cd "$WORK" && rm -f "$IPA" && /usr/bin/zip -qry "$IPA" Payload)
fi

# ------------------------------------------------------------------ verification
[[ -f "$IPA" ]] || die "IPA was not created."
CHECK="$WORK/check" && rm -rf "$CHECK" && mkdir -p "$CHECK"
unzip -q "$IPA" -d "$CHECK"
APPDIR=$(ls -d "$CHECK/Payload/"*.app | head -1)
[[ -n "$APPDIR" ]] || die "IPA has no Payload/*.app"
GOT_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APPDIR/Info.plist")
GOT_VER=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APPDIR/Info.plist")
GOT_BUILD=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APPDIR/Info.plist")
PROMOTION=$(/usr/libexec/PlistBuddy -c 'Print :CADisableMinimumFrameDurationOnPhone' "$APPDIR/Info.plist" 2>/dev/null || echo missing)
EXE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APPDIR/Info.plist")
[[ "$GOT_ID" == "$BUNDLE_ID" ]] || die "Bundle id mismatch: $GOT_ID"
[[ "$GOT_VER" == "$VERSION" ]] || die "Version mismatch: $GOT_VER"
[[ "$GOT_BUILD" == "$BUILD_NUMBER" ]] || die "Build number mismatch: $GOT_BUILD"
lipo -info "$APPDIR/$EXE"
[[ -d "$APPDIR/Frameworks/UnityFramework.framework" ]] || die "UnityFramework.framework missing from the app"

echo
echo "IPA:          $IPA"
echo "Size:         $(du -h "$IPA" | cut -f1) ($(stat -f%z "$IPA") bytes)"
echo "SHA-256:      $(shasum -a 256 "$IPA" | cut -d' ' -f1)"
echo "Bundle id:    $GOT_ID   version $GOT_VER ($GOT_BUILD)"
echo "ProMotion:    CADisableMinimumFrameDurationOnPhone = $PROMOTION"
if [[ $SIGNED -eq 1 ]]; then
  codesign -dv --verbose=2 "$APPDIR" 2>&1 | grep -E "Identifier|Authority|TeamIdentifier" || true
  codesign --verify --deep --strict "$APPDIR" && echo "Signature:    valid"
else
  echo "Signature:    UNSIGNED — sign it with ESign (or this script's signing variables) before installing."
fi
