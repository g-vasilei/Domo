# Device state and Tuya API usage

The server shares device snapshots by Tuya project, region and credential version in one backend process. The deployed Compose configuration runs one backend. The default Pulsar subscription uses Failover delivery: multiple backend replicas would need a shared state/event bus before they can replace polling safely.

## Commands and reported state

The November 24 regression was the immediate full-house read after a command: Tuya could acknowledge the command before its list endpoint reflected the new state. That old response was then cached for two minutes. Browser refetches kept receiving it even after the physical device changed.

- Commands now keep the last reported house snapshot and invalidate only the affected device's detail/status reads. Command values never become reported state.
- Confirmation first accepts a fresh matching push report. Otherwise it waits 250, 750 and 1,500 ms before up to three targeted `/devices/:id/status` reads, each with a 1,500 ms request timeout. It never resends the command. All requested codes must have been reported after this command began; unrelated telemetry cannot confirm cached power values.
- The response is `{ success: true, confirmed, report }`. An accepted but unconfirmed command retains the actual reported value and displays an explicit confirmation failure. An ambiguous delivery failure also starts bounded background reconciliation without resending the write.
- Actual reports update list, room, detail and status caches and broadcast `device:reported` to current authorized viewers. The client applies these reports directly, cancels older in-flight view reads and rejects older report versions. A confirmed command does not trigger a full-house refetch in every browser.
- Lagging unmatched readbacks update the display but cannot trigger/rearm automations or alarm rules. During confirmation, periodic monitoring treats that device as unknown. Matching confirmations and actual push reports evaluate rules immediately. Persistent edge detection still prevents duplicate automation actions.
- An auto-off timer is retained if OFF was accepted but not confirmed. Power-on timers remain persisted before sending ON.

`back/test/tuya-confirmation.test.cjs` reproduces a stale first status response followed by the actual state: all cached views update after 1,000 ms of simulated time, with two targeted GETs, one POST and no additional house-list request. A permanently unchanged report stops after three GETs and never displays the requested ON value.

## Message delivery and polling

`TuyaMessagesService` uses the existing project's default Production subscription, with the protocol documented in [Tuya's Node.js integration](https://developer.tuya.com/en/docs/iot/Pulsar-SDK-get-message-nodejs?id=Kawfmtxp8yscg). It verifies TLS, verifies the signed envelope before decrypting AES/ECB or AES/GCM, supports legacy and IoT Core status/connectivity messages, acknowledges processed/ignored messages, monitors heartbeats and reconnects with bounded backoff. No extra cloud subscription is created. Secrets, headers and raw messages are not logged.

Old retained reports, old property timestamps and duplicate/out-of-order properties cannot resurrect stale state or replay old transitions. A report from before arming cannot trigger the newly armed alarm. Reconnecting invalidates the shared list once to reconcile the gap.

Receiving push reports is enabled by default (`TUYA_MESSAGES_ENABLED=true`). Replacing security polling is **separately opt-in** (`TUYA_MESSAGES_REPLACE_POLLING=true`) because a successful socket handshake does not prove that Production messaging rules include every alarm/automation device. With the default `false`, the existing 30-second critical checks remain active even if the socket connects. Push reports and targeted command confirmation still update the UI promptly.

After verifying coverage and opting in, device/room/dashboard reads share a ten-minute reconciliation snapshot. Alarm and automation checks keep their 30-second schedule but read the snapshot locally while the message stream is live. Actual reports evaluate them immediately. A lost connection/heartbeat restores fresh-cloud monitoring automatically; critical reads then share a five-second cache as before. Offline or missing values remain unknown.

Without verified message delivery, ordinary UI reads retain the two-minute snapshot. Room membership is cached for six hours and specifications for 24 hours. Manual refresh uses `?refresh=true` with a five-second cooldown (one minute for room membership). Individual confirmed readings update shared snapshots, and recent reports are protected from lagging HTTP list responses. Pagination includes sensors on subsequent device-list pages.

### Enable in production

1. In the Tuya project, enable Message Service and publish/enable **Production** messaging rules for device property and online/offline events. Include every device used by alarms and automations; use device/BizCode filters to avoid unrelated traffic and duplicate message types. Keep the existing default subscription rather than adding duplicate subscriptions. See [Manage Message Service](https://developer.tuya.com/en/docs/iot/manage-messages?id=Ka49p7loog3ze).
2. Leave `TUYA_MESSAGES_REPLACE_POLLING=false` while checking actual reports, including a real state change from each monitored sensor/device. Check Production consumption/accumulation in Tuya and connection/received counts under **Settings → Tuya** in Domo.
3. Once verified, set `TUYA_MESSAGES_REPLACE_POLLING=true` in the server's `back/.env` and recreate the backend container so it receives the new environment. Compose already uses that env file. The default false must not be changed just because the socket opens.

The Tuya account check was deferred by the user on November 24; Production rules and actual account usage have **not** been verified by this repository change. No physical test commands were sent.

### Measured request budgets

For one backend process, one project/device-list page and six rooms in one home:

| Mode                                                 | Bulk state reads/day | Room metadata reads/day | 30-day reads before tokens, commands and manual refresh |
| ---------------------------------------------------- | -------------------: | ----------------------: | ------------------------------------------------------: |
| Ordinary UI, message replacement not enabled         |                  720 |                      28 |                                                  22,440 |
| UI + critical monitoring, verified live messages     |                  144 |                      28 |                                                   5,160 |
| Continuous critical monitoring without live messages |       At least 2,880 |                      28 |                                         At least 87,240 |

The tests simulate a full day for the ordinary and verified-message cases. Different fallback check schedules can add calls when they do not overlap within the five-second cache. Additional pages, projects, restarts and failures also add requests. The 144/day budget is conditional on a verified, live stream and the opt-in setting; it is not the current verified production rate.

An armed alarm or enabled device-state automation without verified messages can still exceed the Trial allowance. Push messages also consume Tuya resources: this does not make the service unlimited. Tuya's [pricing documentation](https://developer.tuya.com/en/docs/iot/membership-service?id=K9m8k45jwvg9j) describes shared base resources for API calls and messages. The email showing **7% remaining** means approximately 93% of that allowance was consumed; it does not identify which API, message type or project caused it.

The owner-only `/devices/connection` endpoint and **Settings → Tuya** show actual outgoing API attempts (including token calls and failures), counts by normalized endpoint, received messages, connection status and whether polling replacement is active. Counters are per process/project since server startup, not the vendor's monthly bill. Reading diagnostics does not issue Tuya API calls. Use Tuya **Cloud → Data Statistics → Usage / API Statistics / Message Statistics** for account-wide attribution.

## Reproduced ON-while-OFF defect in the deployed client

On November 18, 2026, the open production page loaded `https://domo.gvasilei.gr/assets/index-B9jYH65L.js` (SHA-256 `c20fd666840dd276d7d58a1e9ed6d64b5ec901a9f061ba3aa18dacfc58cd769f`). Its actual command handlers and room-query options were extracted and replayed with controlled Tuya responses. No commands were sent to physical devices.

The deployed code has two connected defects:

1. Both command success and `device:update` call `updateDeviceCaches` with the **requested commands**. This replaces the stored status value without reading the device. A successful command request is treated as a state report.
2. The device page's `['rooms']` query has **no refetch interval**, and the backend sends WebSocket updates only for commands made through Domo. A physical switch or Smart Life change produces no update in this page. `staleTime` does not schedule reads. An ON value can therefore remain indefinitely until a manual refresh, focus resynchronization, reconnect or remount. The old server's two-minute room cache can also return the older value during an early refresh.

| Replay using production code                                       | Provider state | Displayed ON devices | Device reads after change |
| ------------------------------------------------------------------ | -------------- | -------------------: | ------------------------: |
| 14 devices change externally from ON to OFF; wait 300 seconds      | All OFF        |                   14 |                         0 |
| Manually refetch after that wait                                   | All OFF        |                    0 |                         1 |
| Simulate 14 accepted ON requests while reports remain OFF          | All OFF        |                   14 |                         0 |
| Fixed page and shared server cache; external OFF, wait 120 seconds | All OFF        |                    0 |                         1 |

This reproduces the reported mismatch using the deployed data-handling code, independently of button labels or colors. It is a controlled reproduction, not a retained historical trace of the user's physical devices. The regression test in `front/test/external-device-state.test.cjs` exercises the real page query and server cache: all 14 ON values become OFF without a Domo command, socket notification or focus change.

The November 18 fix removed command-payload patching and added periodic reconciliation. External changes without a working message stream can still take up to two minutes to appear. The November 24 changes above add direct push delivery and targeted command confirmation instead of immediately caching a lagging full-house response.
