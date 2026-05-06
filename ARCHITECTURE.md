# constitute-logging-ui Architecture

`constitute-logging-ui` is a browser app surface for operators and manual proof.

## Owns

- Logging operator Dashboard, Events, and Settings composition.
- Runtime projection observation and filter controls.
- Generic tabular presentation for `LogEventEnvelope` records.
- Event detail affordances when client-side decrypt/view exists.
- Calm projection freshness indication in primary UI.
- Explicit client-side decrypt/view affordance for encrypted detail refs.
- App-specific prepared models and actions passed into `constitute-ui`.

## Does Not Own

- Logging ingestion or indexing.
- Storage persistence.
- Producer safe-fact formulation.
- Plaintext decrypt inside `constitute-logging`.
- Detection, notifications, Cybersecurity, or Physical Security workflows.
- Shared drawer/account-center/notification/nav interaction mechanics; those come from `constitute-ui`.

## Direct Entry

Direct app entry is canonical.
The app attaches to account/runtime authority and observes runtime-materialized projections for `logging.events` and logging dashboard/status facts.

When event projections are missing, stale, or incomplete, account/runtime synchronizes them through service-owned CAAC projection exchange. Gateway routes and attests, while `constitute-logging` owns projection semantics and sync priority.

Browser product code must not call `constitute-logging` HTTP or WebSocket APIs directly, and app URLs must not carry raw logging API hints such as `?api=`.

The app menu has three primary routes:
- `Dashboard`: reduced severity/current-status facts and critical/error shortlist
- `Events`: table over the materialized `logging.events` projection
- `Settings`: sync depth policy and retention policy configuration

The default Events policy is rolling 72h, low verbosity, no hard severity floor, service-side critical/error/warn prioritization, and noise excluded unless enabled.

Logging UI remains generic over `LogEventEnvelope` records and renders the live tail as a compact table.
Filtering uses one command input with autocomplete and removable pills instead of fixed select rows.
Filter keys are generic (`time`, `severity`, `category`, `outcome`, `source`, `subject`, `tag`, `fact`, `resource`, `correlation`), values are hardcoded where the protocol knows the complete set and dynamically derived otherwise.
Known range filters such as `time` and `severity` complete as `key: start - end`; raw search terms can still be forced into filter pills.
The suggestion interaction follows the shared prefix-completion pattern: arrow keys move through suggestions, tab/enter accepts the current field/value, and backspace from an empty input restores the previous pill for editing.
Filters are derived from severity, category, outcome, producer/resource refs, tags, and dynamic `safeFacts`; the UI does not hardcode per-service log schemas.
Tags render in their own pill column.
Tags that normalize to the category, source, subject, outcome, or level columns are suppressed as duplicate presentation.
Safe facts render only when they are not already represented by table columns, tag pills, or visible source/subject values.
Encrypted detail refs render behind a Details action; plaintext decrypt/view stays client-side through account/runtime and must not be performed by `constitute-logging`.
Contiguous exact-match events collapse into one row when each repeated entry is within 60 seconds of the previous match; the row exposes the repeat count and can expand to show the individual entries.
The Events table observes the materialized runtime projection. It must not coordinate transport chunks, scroll paging, cursors, or service query windows.
Semantically unchanged retained projection snapshots must be ignored by the UI observer so repeated runtime snapshots do not re-index or re-render the same event set.
Projection observer updates must not rerender Settings. Settings controls own active operator input and should update only on explicit Settings entry or policy edits.

Health/archive details, projection retry state, and transport diagnostics are available only through debug-gated side channels such as console/performance marks, bounded diagnostic buffers, or diagnostics-only panels. Primary UI must not expose raw projection, CAAC, transport, parser errors, manual refresh buttons, or retry text.

The shared chrome must render resolved identity display labels from the account/runtime projection.
Raw identity ids are reserved for copy/debug actions and must not be the primary account rail label.
