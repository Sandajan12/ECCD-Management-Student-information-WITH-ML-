# AMES Parent — React Native Android, Phase 1

Standalone React Native **0.86.3** / React **19.2.3** / TypeScript app. Android
package `com.ameskinder.parent.native`, version **1.0.0 (1)**, minimum Android 8
(API 26), compile SDK 36, target SDK 35. The APK bundles Hermes and JavaScript;
Metro and a browser are not required on the phone. Both ARM64 and ARMv7 phones
are supported. The Java/Kotlin namespace ends in `nativeapp` because `native` is
a Java keyword; the installed application ID remains exactly as requested.

This directory is independent of `backend/`, `frontend/`, and the older
`mobile/parent-android` TWA. No website imports, database changes or deployment
steps are involved. The school seal was copied through `git show` from
`feat/parent-android-app`, without switching or changing that branch.

## Implemented

- Parent login, registration, email OTP and explicit staff account switching.
  Registration matches server name/combined-name/password/UTF-8 limits. The
  backend remains authoritative for email validation. Failed registration email
  delivery retries the same registration. Resend repeats login/registration;
  there is no parent resend/reset endpoint. Passwords and OTP challenges remain
  in RAM. Review the existing website terms before accepting the checkbox.
- Linked children and adviser/section/year/status cards, with selection in
  `ames_child_${user.id}`. Visible views refresh every 20 seconds and on resume;
  a hidden/unlinked child falls back to an eligible sibling.
- Dashboard, PRE/MID/POST summaries, raw/scaled/standard scores, domain matrix
  and expandable indicators. The eight granular permission fields remain
  independent; unreleased periods show placeholders. Mark access never releases
  scores. Restricted marks show only the server-masked parent's own home
  observations in eligible open windows.
- Readiness and manually requested Random Forest insights, including probability
  percentages, baseline domains, home activities and research limitations.
- Dynamic school name/color/data-URL PNG/JPEG/WebP logo from `/api/settings`.
  The bundled seal is the fallback for unavailable/unsupported logo formats.

Phase 2 profile/home-observation CRUD, durable answer drafts and messaging are
not implemented. This release does not create, delete, migrate or replay any
website drafts. Assessment data is held in RAM and requires connectivity.

## Authentication boundary

`ParentHttpClientFactory` is installed before React Native startup. It adds the
existing school Origin/Referer only for authentication calls to the configured
API origin. Its native `CookieJarContainer` intentionally ignores RN's WebView
cookie-handler replacement. Only host-only, HttpOnly `ames_refresh_token` at
`/api/auth`, Secure for HTTPS, is accepted. Its original scheme/host/port is
persisted alongside the cookie so local-testing builds cannot inherit production
cookies. The encrypted preference uses Android
Keystore, has no JS token getter, and is excluded from backup/transfer. No HTTP
response cache or cross-origin redirects are enabled. Set-Cookie is stripped
before delivery to JavaScript. A generation check rejects old cookie responses
after logout. SameSite is enforced here by exact origin/path scoping rather than
browser site policy.

Access JWTs and user context exist only in `SessionManager`/React RAM. Startup
uses bodyless cookie refresh. Protected requests use Bearer headers, share one
refresh and retry at most once. Revoked/invalid tokens and inactive accounts
invalidate the session; ordinary permission 403 does not. Transient renewal
failures retain RAM and share 30/60/120-second cooldowns, respecting Retry-After.
Renewal is checked every 30 seconds in the foreground and on resume, with server
Date compensation. No parent form is replayed automatically.

Logout attempts server revocation, clears the native cookie and RAM, and uses
the non-sensitive `ames_logout_pending` marker to prevent offline logout from
restoring a session. There are no persisted access tokens, user objects, roles
or credentials in AsyncStorage. Child selection and logout pending are the only
AsyncStorage values used in Phase 1.

## Local Windows setup

- x64 Temurin **17.0.21+9**: `C:\Users\user\.jdks\temurin-17-x64`.
  The download was checked against the official Adoptium SHA-256. Do not use the
  x86 Bubblewrap JDK. `android/gradle.properties` pins the x64 directory.
- SDK: `C:\Users\user\.bubblewrap\android_sdk`. Ignored
  `android/local.properties` contains
  `sdk.dir=C:/Users/user/.bubblewrap/android_sdk`.
- Gradle **9.3.1** reuses the existing wrapper cache. RN's template uses AGP
  **8.12.0**, Kotlin **2.1.20**, NDK **27.1.12297006** and CMake **3.22.1**.
  NDK/CMake are required even though app screens are written in TypeScript.
- Node **24.11.1**, pnpm **12.11.2**. `.npmrc` contains
  `node-linker=hoisted`; pnpm 12 also reads `nodeLinker: hoisted` in the isolated
  workspace YAML. Do not add this app to the root website workspace.
- CMake's staging directory is shortened inside this app and object paths are
  hashed to accommodate Windows paths. No registry/global path changes needed.

From this directory:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd exec tsc --noEmit
pnpm.cmd test
$env:JAVA_HOME='C:\Users\user\.jdks\temurin-17-x64'
$env:ANDROID_HOME='C:\Users\user\.bubblewrap\android_sdk'
Set-Location android
./gradlew.bat assembleRelease testReleaseUnitTest '-PamesSigningProperties=C:/Users/user/AMES-Android-Keys/parent-native-android/release-signing.properties' --console=plain
& "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat" verify --verbose --print-certs app/build/outputs/apk/release/app-release.apk
```

The two tests are app-only Node tests and Android JVM tests with MockWebServer;
they do not contact the school API or a database. No Playwright or pytest is
required. See [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md) for executed
checks and limitations.

## API configuration

Default: `https://api.ameskinder.com`. For an emulator build use
`-PamesApiUrl=http://10.0.2.2:8000`. Physical USB testing can use
`adb reverse tcp:8000 tcp:8000` and `-PamesApiUrl=http://127.0.0.1:8000`.
HTTPS origins and HTTP loopback/emulator origins are accepted; arbitrary HTTP
LAN origins are rejected. Auth Origin/Referer remain the audited school origin.
The base URL is compiled into the native app and passed to TypeScript through
the non-secret `NativeSession.baseUrl` constant. Rebuild after changing it.

## Release identity (outside Git)

New native-app identity, separate from the older TWA:

- Key: `C:\Users\user\AMES-Android-Keys\parent-native-android\ames-parent-native-release.jks`
- Backup: `C:\Users\user\AMES-Android-Keys\parent-native-android\ames-parent-native-release-backup.jks`
- Password/config: `C:\Users\user\AMES-Android-Keys\parent-native-android\release-signing.properties`
- Alias: `ames-parent-native`; RSA 4096. Directory access is restricted to the
  current Windows account and SYSTEM. Copy this whole directory to your protected
  backup storage; the local duplicate alone does not protect against disk loss.

The property file contains `storeFile`, `storePassword`, `keyAlias`, and
`keyPassword`. Never paste its contents into Markdown or commit it. Reuse this
identity and increment versionCode for data-preserving updates. Never uninstall
or clear data to verify an upgrade. Build products, local configuration and keys
are ignored; the signed APK is delivered locally, not committed or published.
