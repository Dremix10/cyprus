# Icon and splash sources

- `make-icon.py` writes `titsu-icon.svg` (home screen / App Store icon, navy background) and
  `titsu-splash.svg` (the same emblem on transparent, for the launch screen).
- Render each at 1024×1024 in a browser (Chromium via Playwright from `e2e/web` works), then:
  - `images/icon.png`: no alpha → `magick in.png -alpha off -depth 8 -strip PNG24:images/icon.png`
  - `images/splash-icon.png`: keep alpha → `magick in.png -depth 8 -strip PNG32:images/splash-icon.png`
- The icon only changes on devices with a new native build (EAS build), not with an OTA update.
