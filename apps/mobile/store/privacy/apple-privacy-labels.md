# Apple App Privacy labels (v1)

Fill App Store Connect **App Privacy** to match this table. `NSPrivacyTracking` = false. No third-party ad SDKs.

| Data type | Linked to user? | Used for tracking? | Purpose | Notes |
| --------- | --------------- | ------------------ | ------- | ----- |
| Email address | Yes | No | Account auth | SSO / session |
| Name | Yes | No | Account auth | Display name |
| User ID | Yes | No | Account auth | Subject / org membership |
| Device ID | Yes | No | App functionality | Expo push token for approval alerts |
| Photos or Videos | Yes | No | App functionality | Only when the user attaches evidence via camera / library |
| Product interaction | Yes | No | App functionality / Analytics | Approve / decline / ask teammate (audit) |

**Not collected for v1:** Health, Financial Info (bank accounts / credit cards — org spend *display* is not payment instrument collection), Precise Location, Contacts, Browsing History, Advertising Data, Purchases (app does not sell IAP in v1).

## Privacy manifests in the binary

| Source | Required Reason APIs declared |
| ------ | ----------------------------- |
| App (`app.config.ts` → `ios.privacyManifests`) | UserDefaults `CA92.1` (app settings / prefs) |
| `clawql-secure-clipboard` (`PrivacyInfo.xcprivacy`) | **None** — pasteboard + `isExcludedFromBackup` only; no file-timestamp / disk-space / Active Keyboards APIs |
| Expo modules (secure-store, notifications, …) | Their own bundled manifests |

## Offline cache

Review / activity / inbox snapshots are encrypted (AES-GCM) on device, stored under Caches + excluded from backup, and cleared on sign-out. Not transmitted as a separate “data type” beyond normal product interaction with the server when online.
