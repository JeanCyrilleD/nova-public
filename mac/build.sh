#!/bin/bash
# Compile Nova.app (macOS 13+, Apple Silicon ou Intel). Prérequis : Xcode Command Line Tools (xcode-select --install).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "▶ Compilation (release)…"
swift build -c release --product NovaMac
BIN="$(swift build -c release --show-bin-path)/NovaMac"
APP="build/Nova.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Nova"
rm -rf "$APP/Contents/Resources/web"; cp -R web "$APP/Contents/Resources/web"
rm -f "$APP/Contents/Resources/web/_avatar_test.html"
cp mac/Info.plist "$APP/Contents/Info.plist"
[ -f mac/Nova.icns ] && cp mac/Nova.icns "$APP/Contents/Resources/Nova.icns" || true
# Signature à IDENTITÉ STABLE : l'exigence désignée ne dépend que de l'identifiant « com.ahadi.nova » (pas du hash du binaire), donc macOS
# garde les autorisations (Calendrier, Mail, Accessibilité…) d'une reconstruction à l'autre au lieu de les redemander à chaque fois.
codesign --force --deep --sign - --identifier com.ahadi.nova --requirements '=designated => identifier "com.ahadi.nova"' "$APP" 2>/dev/null && echo "✓ signature stable (identité com.ahadi.nova)" \
  || { codesign --force --deep --sign - "$APP" 2>/dev/null && echo "✓ signature ad hoc (repli)" || echo "(signature ignorée)"; }
echo "✓ $APP prête. Lancer : open $APP"
