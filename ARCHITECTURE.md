# constitute-logging-ui Architecture

`constitute-logging-ui` is a browser app surface for operators and manual proof.

## Owns

- Logging operator navigation and view composition.
- Live tail and filter controls.
- Gateway/service timeline presentation.
- Event detail shell.
- Logging health/config and storage archive status presentation.
- Explicit client-side decrypt/view affordance for encrypted detail refs.

## Does Not Own

- Logging ingestion or indexing.
- Storage persistence.
- Producer safe-fact formulation.
- Plaintext decrypt inside `constitute-logging`.
- Detection, notifications, Cybersecurity, or Physical Security workflows.

## Direct Entry

Direct app entry is canonical.
The app attaches to account/runtime authority, requests service access for `logging`, and consumes `constitute-logging` query/watch APIs.
