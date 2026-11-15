# Parent web UI parity — local release verification

Date: **2026-11-15**. Branch: **feat/parent-native-android**.
Foundation: Phase 2 `7c882bc`. App: **AMES Parent 1.2.0 (version code 3)**.

## Executed UI release checks

| Check | Result |
| --- | --- |
| `pnpm.cmd exec tsc --noEmit` | Passed, including the final UI feedback refinements |
| `pnpm.cmd test` | 27 passed; existing auth/permission/profile/draft/messaging coverage plus Philippine timestamp/status presentation checks |
| `gradlew.bat testReleaseUnitTest assembleRelease` | First build passed in 4m 50s, 4 native tests passed; final bundle rebuild passed in 1m 29s (161 tasks, 9 executed/152 current, unchanged native tests reused) |
| Native release lint / R8 | Passed; existing upstream deprecation warnings only |
| `apksigner.bat verify --verbose --print-certs` | Verifies, APK v2, one RSA-4096 signer; same certificate as Phases 1–2 |
| `zipalign.exe -c -P 16 4` | Passed, exit 0 |
| APK badging | AMES Parent; `com.ameskinder.parent.native`; 1.2.0/code 3; min 26/target 35/compile 36; ARM64 + ARMv7 |
| Packaged assets | Hermes bundle 1,279,880 bytes matches generated output; sourcemap matches all 19 application files; all five fonts match source bytes; all 30 referenced icon glyphs exist |
| Isolation | No tracked or untracked changes in backend/frontend; protected branch refs unchanged; existing untracked TWA unchanged by a recursive 10,079-file SHA-256 fingerprint |

Signed APK (ignored by Git):

```text
C:\Users\user\Desktop\AMES with ML\mobile\parent-native-android\android\app\build\outputs\apk\release\app-release.apk
```

Size: **24,851,151 bytes**. SHA-256:

```text
a8b8083415df735c2401edcb722eb626fa4145dd0eadab91c0e4b51a439c273f
```

Signer certificate SHA-256:

```text
a58b8be298272fd4ebc9b15764fb269a36373d630bf321bbdc17d62980574fa8
```

Built with the existing external backup (credentials remain outside Git):

```text
C:\Users\user\AMES-Android-Keys\parent-native-android\ames-parent-native-release-backup.jks
```

Rebuild commands remain in README.md. Install as an update without uninstalling
or clearing data. Main remains `c5d9279`, older Android branch remains `0f4629c`.
The requested completely clean older TWA status was impossible at session start:
its pre-existing untracked files were preserved, neither added nor removed.
The folder fingerprint before/after is
`aff4ddcd81040c4fadcf7d49df3cc19169d872e91779fe4877c3569dda085365`.

UI source mapping, native adjustments and phone acceptance scenarios are in
[UI_PARITY.md](UI_PARITY.md). No new npm package, service architecture or replay
mechanism was added. Cookie bridge, session, storage, permission, home-submission,
profile validation/diff and messaging service files are unchanged from Phase 2.
The composer additionally checks its captured recipient after persisting input
so navigating to another thread cannot redirect that pending send.

No emulator is installed locally. There was no phone rendering/pixel comparison,
real account/OTP, live authenticated Socket.IO or school data verification. Unit
tests do not prove actual Android storage/Keystore or keyboard/Back behavior.
No backend/frontend build/tests, Playwright, pytest, provider operation, database
operation, push, app uninstall or data clearing was performed.

---

# Historical Phase 2 local release verification

The APK path below has been replaced by the UI release above; historical hashes
and version numbers describe the previous build only.

Date: **2026-11-15**. Branch: **feat/parent-native-android**.
Foundation: `4766901`. App: **AMES Parent 1.1.0 (version code 2)**.

## Executed Phase 2 checks

| Check | Result |
| --- | --- |
| `pnpm.cmd exec tsc --noEmit` | Passed |
| `pnpm.cmd test` | 25 passed, none failed/skipped; profile diff/validation, ASCII LRN, draft envelopes/revision cleanup/storage failures/manual-only loading, messaging profile IDs/dedup/read receipts/token rotation/late history, and Phase 1 auth/permission regressions |
| `gradlew.bat testReleaseUnitTest assembleRelease` | BUILD SUCCESSFUL in 9m 43s; 4 native tests passed, zero failures/errors/skips |
| Release lint / R8 | Passed, shrinking enabled; existing upstream deprecation warnings only |
| `apksigner.bat verify --verbose --print-certs` (36.0.0) | Verifies; one RSA-4096 signer; APK v2; certificate matches Phase 1 |
| `zipalign.exe -c -P 16 4` | Passed, exit 0 |
| APK badging | AMES Parent; `com.ameskinder.parent.native`; 1.1.0/code 2; min 26, target 35, compile 36 |
| Standalone contents | ARM64/ARMv7 Hermes libraries; JavaScript bundle 1,248,844 bytes, hash matches generated release bundle |
| Isolation | Only this app plus concise AI_CONTEXT.md/AI_CONTEXT_HISTORY.md updates; protected paths/audit/AGENTS unchanged from foundation; main and older Android branch unchanged; pre-existing untracked TWA retained |

Signed APK (local, ignored by Git):

```text
C:\Users\user\Desktop\AMES with ML\mobile\parent-native-android\android\app\build\outputs\apk\release\app-release.apk
```

Size: **24,308,409 bytes**. APK SHA-256:

```text
9a14bf2d71ceccd34fc1e395d769bc9ebb4bc3e1870f3bac2bd6c0f63bbb129f
```

Signer certificate SHA-256:

```text
a58b8be298272fd4ebc9b15764fb269a36373d630bf321bbdc17d62980574fa8
```

The build explicitly used `-PamesSigningStoreFile` with the existing backup:

```text
C:\Users\user\AMES-Android-Keys\parent-native-android\ames-parent-native-release-backup.jks
```

Credentials remain in the external protected `release-signing.properties` beside
the keystore. Neither file was edited or copied into the repository. Rebuild
commands are in README.md. Install as an update; do not uninstall or clear data.

## Phase 2 implementation and acceptance boundary

Delivered LRN linking with pending approval, permission-aware child/household
profiles with changed-field saves, home-only observations with the exact audited
account-scoped envelopes and manual submission, and contacts/history/send/read/
unread messaging with Socket.IO. Auth/user state stays in RAM. Home permission,
period windows, saved-answer locks, checklist marks and score release stay
independent. No parent server deletion endpoint was invented: Remove local answer
changes the device draft only. Successful server observations remain locked.

The review checkpoint asked: "Did this change introduce unnecessary abstractions,
extra state, or new dependencies that existing code already handles?" Only the
requested Socket.IO client was added. The existing HTTP/session manager and UI
are reused; one storage-only draft store serializes writes and revision cleanup,
and the messaging service centralizes socket lifecycle and conversation races.
No navigation/UI/state framework or automatic form replay was introduced.

Node tests inject storage, HTTP and socket events; they do not exercise actual
AsyncStorage on a phone or a live Socket.IO transport. Native JVM tests use
MockWebServer and an injected cookie store, not the real Android Keystore. No
device/emulator, real account/OTP, production school API/data, provider tools,
database, Playwright or pytest was used. Build/signature/alignment success does
not establish authenticated device acceptance.

Test on a phone without clearing Phase 1 app data:

1. Upgrade, restore/login with OTP, then check logout/staff switching and cold
   refresh-cookie restoration, selected child, results and ML regression behavior.
2. Link valid/invalid/already-linked LRNs; confirm SYNCED selection and PENDING
   adviser-approval notice. Close/reopen an unsubmitted link form to recover it.
3. Edit household fields, restart/reconnect and confirm draft recovery; save only
   changed fields, test guardian/contact validation and adviser read/edit locks.
4. Save home answers offline, switch child/period/tab, restart after returning
   online and verify no automatic submit. Manually submit; verify saved locks,
   revision-safe cleanup and retained 403/409/422 drafts. Test each period window
   independently from score release and checklist-mark permissions.
5. Send/receive with a teacher; check oldest-first history, unread badge and read
   receipts. Preserve an unsent composer across app restart/account switching.
   Rotate the access JWT and reconnect networking; confirm history recovery,
   deduplication, rate-limit feedback and no automatic composer send.

The Phase 1 record below is historical. Its APK path has been replaced by the
Phase 2 artifact above; its former size/hash are retained as delivery evidence.

# Phase 1 local release verification (historical)

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
