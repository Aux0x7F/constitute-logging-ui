# constitute-logging-ui

`constitute-logging-ui` is the first-party operator console for `constitute-logging`.

It provides live tail, filters, timelines, event detail shells, logging health/config, storage sync/pin status, and explicit client-side encrypted detail view.

## Boundaries

- Uses `constitute-ui` chrome and primitives.
- Uses account/runtime service access.
- Does not ask `constitute-logging` to decrypt detail.
- Does not own detection, alerting, cybersecurity, or physical-security workflows.
