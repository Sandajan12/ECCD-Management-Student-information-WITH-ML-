# Compact login and native Terms — local release verification

Date: **2026-11-16**. Branch: **feat/parent-native-android**.
Foundation: `9d0cb51`. App: **AMES Parent 1.2.4 (version code 7)**.

| Check | Result |
| --- | --- |
| `pnpm.cmd exec tsc --noEmit` | Passed |
| `pnpm.cmd test` | 49 passed, 7 suites, no failures/skips; includes four new login/Terms interaction tests plus existing auth/assessment/profile/draft/messaging regressions |
| Login/Terms coverage | Compact form and inline blue registration navigation; preserved credentials; explicit agreement gating; exact login/OTP payloads, challenge and resend cooldown; independent checkbox/link; Close never accepts; disabled agreement while busy |
| Website notice comparison | All 14 paragraphs match read-only website source, except "this browser" → "this device"; five sections, official reference links, same title/Close/Accept wording |
| `gradlew.bat testReleaseUnitTest assembleRelease` | BUILD SUCCESSFUL in 7m 45s; 161 tasks (29 executed/132 current); lint/R8 passed, existing upstream deprecations only |
| Native cookie tests | 4 passed, no failures/errors/skips; XML timestamp `2026-11-16T05:05:57.008Z` |
| `apksigner.bat verify --verbose --print-certs` | Verifies, APK v2, one RSA-4096 signer; unchanged release certificate |
| `zipalign.exe -c -P 16 4` | Passed, exit 0 (build-tools 36.0.0) |
| APK badging | AMES Parent; `com.ameskinder.parent.native`; 1.2.4/code 7; min 26/target 35/compile 36; ARM64 + ARMv7 |
| Packaged source/assets | 1,295,676-byte Hermes bundle equals generated output; sourcemap matches all 20 current app sources; five fonts match source; both Hermes ABIs present |

Signed APK (ignored by Git):

```text
C:\Users\user\Desktop\AMES with ML\mobile\parent-native-android\android\app\build\outputs\apk\release\app-release.apk
```

Size: **24,866,947 bytes**. SHA-256:

```text
8ab7981938c4738de6aee7bee701074392fa7f1770779e86d3c2c0dd95f03c71
```

Unchanged signer certificate SHA-256:

```text
a58b8be298272fd4ebc9b15764fb269a36373d630bf321bbdc17d62980574fa8
```

Reused external keystore:
`C:\Users\user\AMES-Android-Keys\parent-native-android\ames-parent-native-release-backup.jks`.
Existing `release-signing.properties` stayed external; credentials were never
printed, edited or tracked. Install this same-key update over the existing app
without uninstalling or clearing data. Build commands remain in README.

Login removes the greeting, website shortcut/copy and registration button, using
the requested inline prompt instead. Terms uses the website's agreement wording
and blue-600 (`#155dfc` sRGB), independent checkbox/link targets, a scrollable
native notice and fixed Close/Accept actions. Reviewing/closing never accepts.
Registration and OTP share the notice; auth payloads, cookies, RAM session,
permissions, manual drafts and messaging contracts remain intact.

Isolation: no modified/untracked additions in backend/frontend; no tracked changes
in the older Android app. Its pre-existing untracked tree remains untouched and
unstaged: all **38,582 files** match the before/after fingerprint
`49013298f91c9c7e3e077c57d6aa512b73159582de3670ccb84fc65a070a7f9b`.
Protected refs remain main `c5d9279ccfe453fa3fb7e7f3240d366d53ba15c0` and
feat/parent-android-app `0f4629cfb6c7b458de032cb200dbee630da08bb2`.
An unrelated untracked root `ECCD_KAYA_CARRY_FORWARD_PLAN.md` appeared during the
session and was also left untouched/unstaged. Only this app and the two authorized
context documents belong to this change.

Component tests use mocked hooks/hosts, not Android rendering. Phone layout,
font scaling, accessibility, Back/scroll/keyboard and real-account/OTP acceptance
remain pending (UI_PARITY.md). No new dependency, provider/database operation,
website/backend tests, Playwright/pytest, push, uninstall or data clearing.

---

# Historical assessment UX update — local release verification

The shared output path now holds 1.2.4/code 7 above. The following version/hash
describes the previous 1.2.3/code 6 artifact only.

Date: **2026-11-15**. Branch: **feat/parent-native-android**.
Foundation: `b2af2c7`. App: **AMES Parent 1.2.3 (version code 6)**.

## Executed assessment release checks

| Check | Result |
| --- | --- |
| `pnpm.cmd exec tsc --noEmit` | Passed |
| `pnpm.cmd test` | 45 tests passed, six focused assessment suites, no failures/skips; includes existing auth/profile/draft/messaging regressions |
| Focused assessment coverage | Permission-safe filtering/order/counts; aggregate release gates; partial saves and tuple isolation; stale/failed refresh; revision/failure retention/manual-only behavior; real component handlers with mocked hooks/hosts |
| `gradlew.bat testReleaseUnitTest assembleRelease` | BUILD SUCCESSFUL in 3m 53s; 161 tasks (29 executed/132 current); 4 native tests passed, no failures/errors/skips |
| Native test evidence | RefreshCookieJarTest XML timestamp `2026-11-15T15:43:30.571Z` |
| Release lint / R8 | Passed; existing upstream deprecations only |
| `apksigner.bat verify --verbose --print-certs` | Verifies, APK v2, one RSA-4096 signer; unchanged certificate |
| `zipalign.exe -c -P 16 4` | Passed, exit 0 |
| APK badging | AMES Parent; `com.ameskinder.parent.native`; 1.2.3/code 6; min 26/target 35/compile 36; ARM64 + ARMv7 |
| Packaged source/assets | 1,284,728-byte Hermes bundle equals generated output; sourcemap matches all 19 current application files; five fonts match source; both Hermes ABIs present |

Signed APK (ignored by Git):

```text
C:\Users\user\Desktop\AMES with ML\mobile\parent-native-android\android\app\build\outputs\apk\release\app-release.apk
```

Size: **24,855,999 bytes**. SHA-256:

```text
d9a2c0b2e3033d5e77aa96e499a4654470ef20ecca62bdfd51d5d4991a1954fc
```

Unchanged signer certificate SHA-256:

```text
a58b8be298272fd4ebc9b15764fb269a36373d630bf321bbdc17d62980574fa8
```

Used the existing external `ames-parent-native-release-backup.jks` and protected
signing properties under `C:\Users\user\AMES-Android-Keys\parent-native-android`.
Neither credentials nor keys were edited or copied into Git. Install over the
existing app without uninstalling or clearing data. Rebuild commands remain in README.

ECCD filters apply mark visibility before grouping/counting/order. Overview
highlights use latest-period server aggregates across home/school answers under
both current child/assessment release gates, without older-period fallback.
Home confirmation IDs are RAM-only and scoped to account/child/period in the
portal; logout clears them and rejects late callbacks. Successful POSTs return
confirmed IDs even if local cleanup fails, while surfacing a storage warning.
Server locks and confirmations hide completed home rows/domains; newer revisions,
other owners and failed submissions retain their drafts. No replay was added.

The whole collapsed assessment card is the tap target; expanded content is a
sibling of the header so domain/answer handlers have no outer toggle ancestor.
Only bottom Messages retains its unread shortcut. Titles are compact, the home
instruction is one sentence, and permission/window locks say Locked by teacher.
Actual incomplete assessments, pending child links and network failures stay distinct.

Isolation checks: backend/frontend have no modified or untracked additions; no
tracked changes exist in the older Android app. Its pre-existing untracked tree
was neither edited nor staged: all **38,582 files** match before/after SHA-256
fingerprint `49013298f91c9c7e3e077c57d6aa512b73159582de3670ccb84fc65a070a7f9b`.
This is the current checkout's baseline, separate from historical release counts.
Protected refs remain main `c5d9279ccfe453fa3fb7e7f3240d366d53ba15c0` and
feat/parent-android-app `0f4629cfb6c7b458de032cb200dbee630da08bb2`.
Only this app and AI_CONTEXT.md/AI_CONTEXT_HISTORY.md are included in the commit.

Tests execute component handlers with mocked hooks and host components, not a
native renderer. No phone/emulator touch, layout, real Keystore/AsyncStorage,
account/OTP, live socket or school-data acceptance was performed. UI_PARITY.md
contains the pending device scenarios. No dependency, backend/frontend change,
provider/database call, Playwright/pytest, push, uninstall or data clearing occurred.

---

# Historical pull-to-refresh and relationship correction — local release verification

The shared output path now holds the release above. The following version/hash
describes the previous 1.2.2/code 5 artifact only.

Date: **2026-11-15**. Branch: **feat/parent-native-android**.
Foundation: `214a324`. App: **AMES Parent 1.2.2 (version code 5)**.

## Executed refresh/form release checks

| Check | Result |
| --- | --- |
| `pnpm.cmd exec tsc --noEmit` | Passed |
| `pnpm.cmd test` | 30 passed; includes all three registration relationship payloads, password-byte preservation and legacy link-draft LRN preservation/relationship omission |
| `gradlew.bat testReleaseUnitTest assembleRelease` | BUILD SUCCESSFUL in 3m 4s; 161 tasks (29 executed/132 current); 4 native tests passed, no failures/errors/skips |
| Release lint / R8 | Passed; existing upstream deprecations only |
| `apksigner.bat verify --verbose --print-certs` | Verifies, APK v2, one RSA-4096 signer; unchanged certificate |
| `zipalign.exe -c -P 16 4` | Passed, exit 0 |
| APK badging | AMES Parent; `com.ameskinder.parent.native`; 1.2.2/code 5; min 26/target 35/compile 36; ARM64 + ARMv7 |
| Packaged source/assets | 1,284,180-byte Hermes bundle matches generated output; sourcemap matches all 19 application files; five fonts match source |
| Static UI review | Every data Screen has an onRefresh handler; chat history has RefreshControl; no refresh button/icon; Overview dashboard loading owned by its screen, without a duplicate summary loader |
| Isolation | Backend/frontend unchanged, no untracked additions there; protected refs unchanged; existing older untracked TWA matched its original fingerprint |

Signed APK (ignored by Git):

```text
C:\Users\user\Desktop\AMES with ML\mobile\parent-native-android\android\app\build\outputs\apk\release\app-release.apk
```

Size: **24,855,451 bytes**. SHA-256:

```text
bfad34910f38716d8edcef6a4c86c90366dcb544c5165c4431e9a551dfabee1c
```

Same signer certificate SHA-256:

```text
a58b8be298272fd4ebc9b15764fb269a36373d630bf321bbdc17d62980574fa8
```

Reused the existing external backup keystore and signing properties documented
below/in README; no key or credential changes. Install over the existing app
without clearing data. Older TWA fingerprint (10,079 files) before/after:
`aff4ddcd81040c4fadcf7d49df3cc19169d872e91779fe4877c3569dda085365`.

Pull-to-refresh reloads the current GET resources/eligible children, keeps valid
cached data on transient failure and preserves drafts/view state. ML reloads
readiness without inference; messaging refreshes contacts/unread/history without
composer submission. Existing read receipts, polling, socket updates and token
renewal remain. A shared hook guards overlapping gestures and clears loading in
finally; unmounted screens do not receive loading-state updates.

Registration dropdown sends Father/Mother/Guardian (Guardian initially). Linking
sends only LRN and restores old LRN drafts while ignoring their relationship.
Read-only source tracing confirmed `/api/parents/children/link` excludes unset
fields before forwarding and inherits the stored parent relationship. No backend
change or live account/database operation was needed. No npm dependency added.

Gesture/loading/dropdown interactions were not exercised on a phone/emulator;
static review and service tests do not prove native interaction acceptance.
UI_PARITY.md lists empty/short pages, repeated gestures, failures, child/tab
switches, input preservation and existing-account relationship checks. No live
OTP/school account/socket acceptance, provider calls, Playwright/pytest, push,
uninstall or data clearing occurred.

---

# Historical Overview and adviser correction — local release verification

The shared output path now holds the release above; the following version/hash
describes the previous 1.2.1/code 4 artifact only.

Date: **2026-11-15**. Branch: **feat/parent-native-android**.
Foundation: UI release `6b7a467`. App: **AMES Parent 1.2.1 (version code 4)**.

## Executed correction release checks

| Check | Result |
| --- | --- |
| `pnpm.cmd exec tsc --noEmit` | Passed |
| `pnpm.cmd test` | 28 passed; includes current-profile adviser name/partial names/whitespace/fallback and unchanged auth, permissions, drafts and messaging coverage |
| `gradlew.bat testReleaseUnitTest assembleRelease` | BUILD SUCCESSFUL in 3m 6s; 161 tasks (29 executed/132 current); 4 native tests passed, no failures/errors/skips |
| Release lint / R8 | Passed; existing upstream deprecations only |
| `apksigner.bat verify --verbose --print-certs` | Verifies, APK v2, one RSA-4096 signer; unchanged certificate |
| `zipalign.exe -c -P 16 4` | Passed, exit 0 |
| APK badging | AMES Parent; `com.ameskinder.parent.native`; 1.2.1/code 4; min 26/target 35/compile 36; ARM64 + ARMv7 |
| Packaged source/assets | 1,279,960-byte Hermes bundle matches generated output; sourcemap matches all 19 application files, including renamed OverviewScreen; five fonts match source |
| Source inspection | Overview default/back destination; one main Screen/scroll container; home/progress initially collapsed; conditional submit bar; no ECCD home-edit entry or Overview Messages card |
| Isolation | Backend/frontend unchanged, no new untracked files there; protected branch refs unchanged; older untracked TWA retains its original 10,079-file fingerprint |

Signed APK (ignored by Git):

```text
C:\Users\user\Desktop\AMES with ML\mobile\parent-native-android\android\app\build\outputs\apk\release\app-release.apk
```

Size: **24,851,231 bytes**. SHA-256:

```text
36dd0c1cf856dd4efe9fd03fd175e37562d984ad5d68e6de8ea81bcebabadad5
```

Same signer certificate SHA-256:

```text
a58b8be298272fd4ebc9b15764fb269a36373d630bf321bbdc17d62980574fa8
```

The build reused the external `AMES-Android-Keys\parent-native-android\`
`ames-parent-native-release-backup.jks` and its external signing properties.
Credentials, native cookie bridge, RAM session, services, API contracts and draft
keys were not changed. No new dependency or automatic draft replay was added.
Existing TWA fingerprint remains
`aff4ddcd81040c4fadcf7d49df3cc19169d872e91779fe4877c3569dda085365`.

Source review confirms collapsing the home section leaves the period state in
the mounted Overview owner; per-domain drafts persist in the unchanged store.
Changing children keys a fresh collapsed Overview. Profile Adviser reads only
the current detail record, combines teacher first/last names, then uses the
optional adviser name or Not assigned; its read permission gate is unchanged.
ECCD retains independent score/mark permissions and the own-observation exception.

No device/emulator rendering, UI interaction automation, live school account/OTP
or authenticated socket acceptance was performed. Source checks and unit tests
are not phone acceptance. Follow UI_PARITY.md to check collapse/reopen, period
and sibling switching, submit confirmation/drafts, locked states and current-child
adviser display. Install over the existing app without clearing data. Backend/
frontend were only read; no provider/database calls, Playwright/pytest or push.

---

# Historical parent web UI parity — local release verification

The shared APK output path now contains the correction release above. The
following hash/version describes the previous 1.2.0/code 3 artifact only.

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
