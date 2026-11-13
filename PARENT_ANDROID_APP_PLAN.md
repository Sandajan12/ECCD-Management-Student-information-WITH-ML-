# AMES Parent Android App

Status: implementation plan only. Saving this document does not implement, build, or deploy the app.

## Summary

Build an installable **AMES Parent** APK that opens the live parent portal using Android Trusted Web Activity. This preserves the existing responsive UI and secure browser authentication. See [Google's Trusted Web Activity documentation](https://developer.chrome.com/docs/android/trusted-web-activity).

Flow: **Website login → Download APK → Install → Open AMES Parent → Sign in → Parent dashboard.**

Include all current parent features: registration, children, home observations, ECCD results, predictions, and messaging.

## Implementation

- **Branch:** create and switch to `feat/parent-android-app` from the clean `main` branch before implementation. This branch was created when saving this plan; continue implementation there.
- Create an isolated mobile project under `mobile/parent-android`, using the approved Bubblewrap tooling through pnpm. Pin its dependencies and document the required JDK/Android SDK setup.
- Use app name **AMES Parent**, package ID `com.ameskinder.parent`, initial version `1.0.0`, Android 8.0+, and the existing school branding.
- Launch through a new `/parent-app` entry route on `https://ameskinder.com`. Redirect authenticated parents to their dashboard and other visitors to login.
- Preserve app context in tab-scoped session storage through login, registration, reload, and session-expiry redirects. This marker controls presentation only; existing backend authorization remains authoritative.
- Place a parent-only gate around app navigation. Staff accounts see an app-only explanation with actions to open the website or explicitly switch accounts. Never automatically log out an existing staff session.
- Reuse existing parent pages, layouts, styles, hooks, and API calls without modifying their UI/UX.
- Add a secondary **Download APK** link below the website login form, with brief Android installation guidance. Hide it inside the app.
- Preserve current HttpOnly refresh cookies, memory-only access tokens, permission checks, draft keys, and manual parent submission behavior. No backend API or database changes are required.

## APK signing and delivery

- Generate a release signing key, keep it and its passwords outside tracked files, and document protected backup and reuse. Android updates must retain the signing identity. See [Android signing documentation](https://developer.android.com/studio/publish/app-signing).
- Publish the real certificate fingerprint through `/.well-known/assetlinks.json`, matching the APK package ID. Configure Android link handling for `/parent-app` so ordinary website links retain their existing behavior.
- Add a parent-app web manifest and launcher icons. Do not introduce a root service worker or change website caching.
- Build and verify the signed APK, then include that public release artifact under the frontend's static downloads directory, with a narrowly scoped Git-ignore exception.
- Serve the download with APK content type, attachment filename, and revalidation headers. Ensure association and download URLs serve real files through the existing SPA hosting configuration.
- Prepare the branch, APK, and deployment instructions for review. Production publication follows validation; an undeployed association file cannot establish fullscreen operation.

## Verification

- Run both frontend TypeScript project checks, lint, and production build.
- Add browser coverage for app entry, parent login, staff gating, expiry redirects, and download visibility. Use an explicit Playwright configuration.
- Run relevant existing authentication and parent workflow checks. Compare website parent screens at mobile, tablet, and desktop sizes to confirm unchanged presentation.
- Verify APK signature, package/version, certificate fingerprint, and download response.
- Test installation and launch on Android: OTP, remembered device, session restoration, Back navigation, keyboard behavior, all parent features, and messaging reconnection.
- Confirm network failures and logout preserve drafts, and reconnection never automatically submits parent work.
- Verify fullscreen domain association on the deployed domain and report separately any device or deployment checks that remain unavailable.
- Update current context and operating guidance; record executed checks in the history document. Review the diff for unnecessary abstractions, state, or dependencies.

## Confirmed defaults and limits

- Shared browser login is accepted; login/logout can affect the website in that browser.
- Existing in-app messaging is included. Background push notifications, iOS, and Play Store publication are excluded.
- Opening the portal and submitting data require internet. Existing local draft protection remains.
- Android build tools were not found on PATH during inspection; installation and device verification remain implementation work.
