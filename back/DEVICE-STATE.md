# Device state and Tuya API usage

The server shares device snapshots by Tuya project, region and credential version. The cache is in memory in one backend process. Multiple server replicas maintain separate caches.

- Normal device, dashboard, and room reads share a project snapshot for up to two minutes. Browser polling reads this snapshot; it does not issue a new Tuya request every time.
- Manual refresh uses `?refresh=true` and a five-second cooldown to combine repeated requests. Manual room refresh can also renew room membership after one minute.
- Room membership is normally cached for six hours. Device specifications are cached for 24 hours.
- Alarm and automation checks keep their existing 30-second interval. Each check reads all devices together and shares concurrent reads with other checks. Their state cache is at most five seconds old. Offline or missing devices do not produce condition values.
- Successful and ambiguous command attempts invalidate state caches. Requested command values are never used as device reports. Reads that started before a command cannot repopulate a newer snapshot with their old result.
- A newer individual device reading corrects cached list and room values. `statusUpdatedAt` records the cloud read time and is not advanced when serving a cached snapshot. Power state remains independent of connectivity.
- The project list is paginated before it is used for monitoring, so sensors on later pages are included.

For a single backend process with 14 devices on one API page and six rooms in one home, continuously open dashboard, room and detail views use 720 device-list reads and 28 room-metadata reads per day. This is **22,440 calls per 30 days**, before token requests, commands, manual refreshes, server restarts and critical monitoring. The test suite simulates a full day of polling to check this count.

An armed alarm or enabled device-state automation running continuously still needs approximately **86,400 bulk checks per 30 days** for one check every 30 seconds. Separate check schedules can add calls when they do not overlap within the five-second cache. This can exceed the Trial allowance. Do not increase alarm detection latency to meet a cloud quota: persistent Tuya event delivery or an appropriate service allowance is required for continuous monitoring. Pulsar message delivery is not configured by this change.

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

The fix removes command-payload patching, re-reads reported state, and periodically reconciles the device page through the shared server snapshot. An external change can still take up to two minutes to appear with the usage-saving cache. Manual refresh and commands bypass or invalidate that cache as documented above.
