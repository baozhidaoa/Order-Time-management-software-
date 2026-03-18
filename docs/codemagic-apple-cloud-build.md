# Order Apple Cloud Build

This repository ships Apple builds through Codemagic.

## Workflows

- `mac_internal_unsigned`
  - Manual builds are always available from Codemagic.
  - `main` pushes automatically build unsigned macOS `dmg` and `zip` artifacts.
  - `v*` tags also upload macOS artifacts to the matching GitHub release.
- `ios_internal_testflight`
  - Manual builds are available from Codemagic.
  - `v*` tags build an `.ipa`, upload it to TestFlight, and attach it to the matching GitHub release.
  - This workflow requires an active Apple Developer Program account.

## Codemagic Variable Groups

Create these environment variable groups in Codemagic and attach them to the app:

- `github_release`
  - `GITHUB_TOKEN`
- `apple_credentials`
  - `APP_STORE_CONNECT_PRIVATE_KEY`
  - `APP_STORE_CONNECT_KEY_ID`
  - `APP_STORE_CONNECT_ISSUER_ID`

Optional future macOS signing group:

- `mac_signing`
  - `MAC_CERT_P12`
  - `MAC_CERT_PASSWORD`
  - `MAC_NOTARIZE_APPLE_ID`
  - `MAC_NOTARIZE_APP_PASSWORD`
  - `MAC_NOTARIZE_TEAM_ID`

## Runtime Contract

- Node version is fixed to `20.19.4` via `.nvmrc` and Codemagic workflow settings.
- Root desktop CI entrypoint: `npm run ci:mac`
- Root mobile CI entrypoint: `npm run ci:ios`

## Current Delivery Status

- macOS is configured for unsigned internal distribution first.
- iOS is configured for TestFlight and will fail fast until Apple App Store Connect credentials are present.
