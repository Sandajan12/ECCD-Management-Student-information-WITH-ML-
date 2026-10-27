# Stop the Messages Request Storm

Date: 2026-10-27  
Status: Complete. Implementation and all acceptance checks passed on 2026-10-27.

## Objective

Stop unnecessary frontend messaging requests in `/teacher/messages` and
`/parent/messages`, preserve reliable delivery and offline drafts, and calibrate
backend limits without weakening unrelated API protections.

## Original root-cause analysis (before the fix)

Both portals render the shared `ChatInterface`. The active source shows
**overlapping polling, rather than an infinite `useEffect` loop**:

- [MainLayout.tsx](frontend/src/layouts/MainLayout.tsx) fetches unread counts every
  **3 seconds**, including while Messages is open.
- [ChatInterface.tsx](frontend/src/components/ChatInterface.tsx) fetches history
  every **15 seconds**, even with Socket.IO connected. Each refresh also sends a
  mark-read request, which triggers another unread-count fetch.
- Initial room setup and socket connection can both fetch history. Sending and
  receiving messages also refetch contacts, while every successful draft-sync
  event refreshes history regardless of its resource.

That produces approximately **32 requests per minute per idle window**, or
**64 across two windows**, before interactions and reconnects:

| Request source | Requests per minute per window |
| --- | ---: |
| Unread-count timer, every 3 seconds | 20 |
| History timer, every 15 seconds | 4 |
| Mark-read after each history refresh | 4 |
| Unread-count refresh after each mark-read | 4 |
| **Total** | **32** |

[rate_limits.py](backend/utils/rate_limits.py) applies **120 requests/minute per
client IP across all API routes**. There is no separate contacts/history limit.
Teacher and Parent windows sharing an IP therefore receive 429s together after
their combined traffic exhausts that bucket. The middleware returns the reported
banner text: `Too many requests. Please try again in a minute.`

Two idle windows alone should remain below 120. Additional traffic is required
to cross it; the exact exhaustion sequence remains to be measured. The user
confirmed that requests occur at regular intervals rather than continuously at
subsecond frequency. The fetch dependencies are stable, Axios does not
automatically retry, and incoming socket messages already append locally rather
than fetching history.

There is also a delivery constraint: the backend currently pushes messages when
the sending browser emits `send_message` after HTTP persistence. Offline draft
replay and profile notifications do not emit that client event. Removing polling
without fixing those paths could hide committed messages until a later refresh.

## Implemented changes

### 1. Share one messaging connection per authenticated portal tab

- Add a messaging provider used by the layout and chat, keyed by account/token.
- Move unread-count handling into it and remove the layout's 3-second timer.
- Preserve cleanup on logout, account changes, and unmount; prevent accumulated
  listeners.
- Keep the messaging provider inside the lazy-loaded portal code so the public
  login page does not eagerly load the chat connection code.

### 2. Make successful database saves drive push delivery

- After committed sends and profile notifications, publish the persisted message
  to every authorized participant session, including other tabs.
- Cover offline draft replay automatically through the same REST handlers.
- Recheck live account/conversation access before delivery. Keep database work in
  worker threads.
- Stop the updated frontend's redundant `send_message` emission; retain that
  existing socket interface for compatibility.
- Push delivery failures must leave committed HTTP saves successful.

Relevant backend implementations are
[messages.py](backend/routes/messages.py),
[realtime.py](backend/utils/realtime.py), and
[messaging.py](backend/utils/messaging.py).

### 3. Replace connected polling with local updates

- Fetch contacts once on page entry and history once for the initially selected
  thread. Subscribe before history hydration so arriving messages can be merged
  safely.
- Append/deduplicate persisted messages by ID, update contact timestamps/order
  locally, and preserve messages received during an in-flight history request.
- Mark read only for new incoming unread messages in the visible, selected thread;
  coalesce receipt requests over 250 milliseconds.
- Add a typed `messages_read` socket event containing conversation IDs to refresh
  unread badges across the reader's tabs. Coalesce event-driven unread-count
  fetches.
- Recover contacts, selected history, and unread count once per reconnect.
  Coalesce overlapping recovery triggers and reject stale responses after
  thread/account changes.
- Ignore unrelated draft-sync events. Process matching message-sync responses
  directly.
- Keep composer drafts, scoped keys, and revision-safe HTTP-confirmed cleanup
  intact. Never clear inputs on failure or use global `localStorage.clear()`.

### 4. Use the selected slow fallback

The user selected a slow fallback when Socket.IO is unavailable but HTTP remains
available.

- Remove both existing intervals.
- When push is unavailable, allow HTTP hydration and run one coordinated fallback
  cycle every **30 seconds**, only while online and visible.
- Back off failures to **60**, then **120 seconds**; stop fallback when push
  recovers.
- Connected focus/visibility events cause no messaging refetch. Disconnected
  resume events share the same guarded scheduler.
- Respect HTTP `Retry-After` and socket `retryAfter`; never immediately retry a
  429. Retain message inputs and require explicit retry for rejected submissions.

## Backend limits and interfaces

Use these fixed-window budgets per existing client-IP identity:

| Exact messaging operations | Budget |
| --- | ---: |
| GET contacts, history, unread-count/unread | 240/minute |
| PUT read/mark-read | 120/minute |
| POST send/root alias and notify-student | 60/minute |

These exact operations receive their dedicated bucket **instead of also consuming
the generic 120/minute bucket**. Other API limits remain unchanged;
`/api/messages/link-lrn` retains its existing API and student-link policies.
Aliases share budgets, and unauthenticated/malformed requests still count.

Preserve response shapes and route paths. Add `Retry-After` to exposed CORS
headers. Existing PostgreSQL counter storage supports the new namespaces without
a migration.

Continue to enforce existing Socket.IO handshake, event, and packet budgets.
The frontend must consume socket rate-limit feedback through the same recovery
and cooldown controls rather than creating reconnect/request bursts.

## Verification and acceptance

### Two-window baseline

- Use separate Teacher and Parent browser contexts sharing one client IP. Separate
  contexts prevent their localStorage-based credentials from replacing each
  other.
- With healthy sockets, assert one initial contacts fetch, one initial
  selected-history fetch, and one initial unread-count fetch per portal. Mobile
  history starts after contact selection.
- Observe both windows for two minutes after initialization. Require **zero
  additional messaging REST requests**, no 429 banners, and one active socket per
  tab. Count Socket.IO transport traffic separately.
- Record requests by endpoint and trigger so initial hydration, actual user
  actions, push-driven receipts, and fallback recovery are distinguishable.

### Live messaging and lifecycle

- Send both directions and across multiple tabs. Confirm one rendered message per
  ID, updated ordering/badges, and no contacts/history GETs caused by socket
  delivery.
- Verify rapid contact switching, repeated focus events, reconnect bursts,
  delayed responses, Strict Mode cleanup, unrelated sync events, hidden tabs, and
  offline draft replay.
- Verify profile notifications and replayed messages reach authorized recipients
  without a sender-side socket emission.
- Verify deactivated accounts, transferred students, and unrelated parents do not
  receive unauthorized push payloads.
- Verify failed sends retain their scoped drafts and that an older confirmation
  cannot erase newer text.

### Fallback and rate limits

- Interrupt sockets while keeping HTTP available. Verify 30-second minimum
  polling, backoff, pause while hidden/offline, and cancellation after recovery.
- Inject HTTP 429 and socket rate-limit feedback. Verify cooldowns, no immediate
  retry loop, and recovery after the allowed delay.
- Test rate-limit boundaries, aliases, shared-IP behavior, window expiry,
  production shared counters, authorization failures, and browser-readable
  `Retry-After`.
- Enable enforcement explicitly in tests whose fixtures normally bypass limits.

### Automated checks

- Extend focused backend messaging, socket, and rate-limit regressions using the
  existing unittest fixtures and disposable PostgreSQL schemas.
- Add focused Playwright desktop/mobile coverage with request-count assertions
  and a real Socket.IO delivery scenario.
- Run both TypeScript projects, frontend lint, and the production build:

```powershell
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.app.json
pnpm.cmd --dir frontend exec tsc --noEmit -p tsconfig.node.json
pnpm.cmd --dir frontend run lint
pnpm.cmd --dir frontend run build
```

Run backend checks with `uv` and the Python 3.12 environment. Test/reset operations
must target disposable schemas, never school data.

## Assumptions and completion criteria

- Assume the repository's current single-process Socket.IO deployment. Scaling
  delivery across multiple processes would require a separate shared event
  transport change.
- Preserve existing authorization, API contracts, database records, assessment
  business rules, and offline durability.
- No database migration is planned for this fix.
- The original investigation above records the pre-fix source behavior. Current
  behavior is implemented in the working tree; verification results are recorded
  below.
- Complete the work only after the two-window idle test, live delivery,
  disconnected fallback, offline durability, and rate-limit regressions pass.
- Update `AI_CONTEXT.md` with the resulting behavior and measured outcomes after
  implementation and verification.

## Implementation and verification record

Implemented in `MessagingContext.tsx`, `services/messaging.ts`, `ChatInterface.tsx`,
`MainLayout.tsx`, the messaging routes/schemas, realtime delivery and rate limits.
The shared draft synchronizer now stops automatic replay of rejected messaging
submissions while retaining their inputs and error; other forms retain their
existing replay rules. Message-sync failures also feed the messaging cooldown.

Additional race protections found during verification:

- Read events contain the exact IDs returned by the committed update, so a
  delayed receipt cannot mark a later message read.
- A scheduled socket cooldown reconnect takes precedence over fallback polling;
  expiry does not launch two history recoveries.
- Handshake 429 responses expose `Retry-After` to allowed browser origins, and
  the client waits before another handshake or hydration.
- Permanent read-receipt authorization/validation failures do not auto-retry;
  transient failures retain delayed recovery.

Verification against synthetic accounts and disposable PostgreSQL schemas:

- **37 focused backend tests passed**: the nine new messaging regressions,
  existing rate-limit/deployment guards, production performance/concurrency, and
  existing REST/socket messaging compatibility tests. Tests explicitly enforce
  budgets where fixtures otherwise bypass them. Production-mode checks exercise
  the PostgreSQL counters with concurrent independent limiter instances.
- Both frontend TypeScript projects, browser test/config TypeScript, full frontend
  lint, production build, focused Prettier checks and Python compilation passed.
- **22/22 browser tests passed in the final complete run (5.4 minutes)** at
  1280px desktop and 375px mobile. The idle checks use real time and real
  Socket.IO; fallback/cooldown timing uses controlled browser clocks. Coverage
  includes both message directions, REST-only notifications, duplicate-free
  rendering, delayed history, contact/draft isolation, multi-tab receipts,
  unrelated sync/focus events, reload/replay, older confirmations, account
  replacement/logout, 30/60/120-second fallback, hidden/offline suspension,
  HTTP/handshake/socket cooldowns, and rejected replay without automatic resend.

Final real-time idle measurements (Teacher/Parent use separate browser contexts
sharing the same client IP; Socket.IO transport traffic is excluded):

| Portal | Initial contacts / history / unread GETs | Additional messaging REST requests in 120 seconds | Active messaging sockets |
| --- | --- | --- | --- |
| Desktop Teacher | 1 / 1 / 1 | 0 | 1 |
| Desktop Parent | 1 / 1 / 1 | 0 | 1 |
| Mobile Teacher | 1 / 1 / 1, after contact selection | 0 | 1 |
| Mobile Parent | 1 / 1 / 1, after contact selection | 0 | 1 |

Both directions of live delivery and REST-only profile notifications produced
one rendered row per message, without additional contacts/history GETs or 429
banners. The final run also passed Git whitespace checks.

Browser tests/config are tracked in `frontend/tests/messaging.spec.ts` and
`frontend/playwright.messaging.config.ts`; generated results remain under ignored
`frontend/test-results/messaging/`. They use the existing loopback-only disposable
API fixture. Browser rate-limit injections exercise client timing; separate
backend tests enforce actual server budget boundaries and shared storage.

No migration, school-record mutation, deployment, or dependency change is needed.
The process-local delivery transport retains the single-process assumption above.
