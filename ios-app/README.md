# Cue Scorer — native iOS wrapper

A tiny native iOS app that bundles the web app (from `../docs`) inside a
`WKWebView` and serves it through a custom URL scheme, so it runs **fully
offline** and keeps your data (player profiles, stats, saved games) between
launches. This is what you install on your iPhone via Xcode and/or AltStore —
no App Store, private to you.

At build time a script copies `../docs` into the app bundle as `web/`, so the
web app is the single source of truth — change the web app, rebuild, done.

## Requirements
- A Mac with **Xcode 16+**
- A **free Apple ID** (no paid Developer Program needed for your own device)
- For auto-refresh: **AltStore + AltServer** installed (optional)

## One-time setup in Xcode
1. Open the project:
   ```bash
   open ios-app/CueScorer.xcodeproj
   ```
2. Add your Apple ID: **Xcode ▸ Settings ▸ Accounts ▸ +** and sign in.
3. Select the **CueScorer** target ▸ **Signing & Capabilities**:
   - **Team** → your Apple ID (Personal Team).
   - If you see a bundle-id conflict, change **Bundle Identifier** to something
     unique, e.g. `com.yourname.CueScorer`.

## Option A — Install straight from Xcode (simplest)
1. Plug your iPhone in (trust the computer).
2. Pick your iPhone in the run-destination menu (top bar).
3. Press **Run (⌘R)**.
4. On the phone: **Settings ▸ General ▸ VPN & Device Management** ▸ trust your
   developer profile.

Free signing lasts **7 days**; just press Run again from Xcode to refresh.
(AltStore isn't required for this route.)

## Option B — Install via AltStore (auto-refreshes the 7-day signature)
First build an `.ipa`:
1. In the run-destination menu choose **Any iOS Device (arm64)**.
2. **Product ▸ Build (⌘B)** (signing Team must be set — see setup above).
3. In the Project navigator, open **Products**, right-click **CueScorer.app ▸
   Show in Finder**.
4. In Finder, make a new folder called **`Payload`** (capital P), and move
   `CueScorer.app` into it.
5. Right-click **Payload ▸ Compress**, then rename `Payload.zip` →
   **`CueScorer.ipa`**.

Then install it with AltStore:
- **On the iPhone:** AirDrop `CueScorer.ipa` to the phone (or save it to Files).
  Open **AltStore ▸ My Apps ▸ +** (top-left) and pick `CueScorer.ipa`.
- **or on the Mac:** AltServer menu-bar icon ▸ **Install .ipa** ▸ choose your
  device ▸ select `CueScorer.ipa`.

AltStore signs it with your Apple ID and **re-signs it automatically** every few
days as long as your iPhone and the Mac running AltServer are on the same Wi-Fi
(open AltStore now and then so it can refresh). That removes the manual weekly
rebuild.

## Updating the app later
After changing the web app in `../docs`, rebuild (⌘R or ⌘B) and reinstall the
same way. The build script re-copies the latest `docs/`.

## Notes
- Free Apple ID signing expires after 7 days; a paid **Apple Developer Program
  ($99/yr)** extends it to ~1 year if you'd rather not rely on AltStore.
- The app stores everything locally on the device; nothing is uploaded.
- The service worker is intentionally excluded from the bundle (not needed when
  the files are local), so there are no caching surprises.
