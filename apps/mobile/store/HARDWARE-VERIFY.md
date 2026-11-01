# Hardware verification (human — before TestFlight)

These checks need a real phone and cannot be completed in CI / Expo web.

## 1. Secure clipboard (development build)

Requires an **EAS development / preview build** so `clawql-secure-clipboard` is linked (Expo Go will stay manual-only).

### iPhone + Mac (Universal Clipboard)

1. Sign the iPhone and a Mac into the **same Apple ID**, with Handoff / Universal Clipboard enabled.
2. Open PhoneApprove → Connections → API keys → **Issue key**.
3. Tap **Copy secret (this device only)**.
4. On the Mac, try to paste into Notes within a few seconds.
   - **Pass:** secret does **not** appear on the Mac.
5. Wait **60+ seconds**, then paste on the iPhone itself.
   - **Pass:** pasteboard is empty / secret gone (expirationDate).
6. Optional: with the bridge unavailable (web), confirm the secret stays on-screen for **manual selection** and Copy reports manual-only.

### Android

1. Issue a key and tap **Copy secret (this device only)**.
2. Open the system clipboard / keyboard suggestion strip.
   - **Pass:** preview is hidden / marked sensitive (Android 13+), not shown in clear text in the overlay.
3. After ~60s, paste elsewhere — content should be cleared.

## 2. Offline cache backup exclusion (spot check)

1. Sign in, open Review so a cache snapshot is written.
2. Confirm the app still shows the offline banner when airplane mode is on (browse-only).
3. Sign out — offline queue must clear (no residual sample data after re-login as another user).

Full iTunes/Finder backup forensics are optional; the implementation stores under Caches + `isExcludedFromBackup`.

## 3. After hardware pass

Continue Day-0: enrollment → TestFlight with reviewer demo → submit using `store/review-notes.md` and `store/export-compliance.md`.
