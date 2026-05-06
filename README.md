# constitute-logging-ui

`constitute-logging-ui` is the first-party operator console for `constitute-logging`.

It provides a compact live tail table, contiguous repeat grouping, runtime-mediated older-page loading on scroll, command-style filter pills with autocomplete/range completion, tag and non-duplicative safe-fact pills, calm projection freshness, and explicit encrypted-detail affordances for future client-side decrypt/view. Logging health/config and storage archive detail stay out of primary UI unless exposed through a debug/config surface.

## Boundaries

- Uses `constitute-ui` chrome and primitives.
- Uses account/runtime service access.
- Does not ask `constitute-logging` to decrypt detail.
- Does not own detection, alerting, cybersecurity, or physical-security workflows.
