# Phase 1 local release verification

Date: **2026-11-15**. Branch: **feat/parent-native-android**.
Base main: `c5d9279ccfe453fa3fb7e7f3240d366d53ba15c0`.

## Executed checks

| Check | Result |
| --- | --- |
| x64 JDK | Temurin 17.0.21+9, `os.arch=amd64`; official download SHA-256 matched |
| `pnpm.cmd exec tsc --noEmit` | Passed |
| `pnpm.cmd test` | 9 passed; registration/UTF-8 rules, independent permissions, bodyless startup refresh, Hermes-compatible JWT decoding, shared refresh, bounded retry, revocation, offline retention/cooldown and logout race |
| `gradlew.bat testReleaseUnitTest assembleRelease` with external signing properties | BUILD SUCCESSFUL; 4 native tests passed, zero skipped/failures/errors |
| Native test scope | MockWebServer verifies Origin/Referer, cookie replay, bodyless refresh, Set-Cookie removal and logout. Injected storage tests verify host/path/secure/HttpOnly restrictions, jar reconstruction, API-origin changes, expiry and stale-response rejection |
| Release lint | Passed after explicit `includeSubdomains=false` for loopback-only HTTP entries |
| `apksigner.bat verify --verbose --print-certs` (36.0.0) | Verifies, one RSA-4096 signer, APK Signature Scheme v2 |
| `zipalign.exe -c -P 16 4` | Passed |
| APK badging / contents | AMES Parent, `com.ameskinder.parent.native`, version 1.0.0/code 1; compile 36, target 35; ARM64/ARMv7; bundled JavaScript asset present |
| Protected paths | No backend/frontend tracked or untracked changes. Existing untracked TWA status matches the initial snapshot; TWA was not staged or edited |
| Protected branches | Main and `feat/parent-android-app` remain at their initial commits |

The Windows path failure was fixed by app-local CMake staging plus a 256-character
object-path budget, which permits filename hashing below Windows' limit. R8
retains all missing-class checks except the four optional Error Prone annotation
classes listed by its generated rules for Tink. Release shrinking remains enabled.
Builds emit upstream deprecation warnings; these did not prevent compilation,
release lint, signing or the focused tests.

The review checkpoint considered unnecessary abstractions, extra state and
dependencies: no navigation, UI framework, state-management, HTTP wrapper library
or database was added. Screens use React Native components; fetch handles HTTP;
the single session manager centralizes the security-sensitive session lifecycle.

## Delivered artifact

```text
C:\Users\user\Desktop\AMES with ML\mobile\parent-native-android\android\app\build\outputs\apk\release\app-release.apk
```

Size: **24,164,533 bytes**.

APK SHA-256:

```text
4b0dd7660089264fa8b5cf327134bb8a2d1512abc0db9db0460f28142767ec18
```

Signer certificate SHA-256:

```text
a58b8be298272fd4ebc9b15764fb269a36373d630bf321bbdc17d62980574fa8
```

External key backup:

```text
C:\Users\user\AMES-Android-Keys\parent-native-android\ames-parent-native-release-backup.jks
```

See the README for the original key, protected signing properties and repeatable
commands. APK, keys, local SDK configuration and generated build files are not
tracked in Git.

## Phone acceptance still required

No emulator or phone session was run. The tests use an injected native cookie
store and a loopback HTTP server; they do **not** establish real Android Keystore
persistence or authenticated production acceptance. No school account, OTP,
production child data, provider tools, database, Playwright or pytest was used.

On an Android 8+ ARM phone:

1. Install this APK, then test parent login and the real six-digit email OTP.
2. Test parent registration and resend cooldown; delivery-failure retry appears
   only if the server returns `REGISTRATION_EMAIL_FAILED`.
3. Close/force-stop and reopen the app without clearing data; verify cookie-based
   session restoration and correct selected-child recovery.
4. Check child cards, released/locked PRE/MID/POST results and independently locked
   checklist marks against the website for the same parent.
5. Generate ML insights for an eligible child and check the research notice.
6. Sign in as staff; confirm the parent-only notice and explicit Switch Account
   action. Test logout/reopen online and offline.

Phase 2 CRUD, home-observation draft storage/submission and Socket.IO messaging
remain outside this release.
