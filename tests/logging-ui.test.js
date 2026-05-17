import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../src/main.js"), "utf8");

test("logging ui package is wired for build", () => {
  assert.equal("constitute-logging-ui".startsWith("constitute-"), true);
});

test("logging ui does not directly consume hosted logging APIs", () => {
  const retiredCapability = ["service", "Capability"].join("");
  assert.doesNotMatch(source, /127\.0\.0\.1:7480/);
  assert.doesNotMatch(source, /10\.0\.30\.44:7480/);
  assert.doesNotMatch(source, /\/v1\/events\/search/);
  assert.doesNotMatch(source, /\/v1\/watch/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bnew\s+WebSocket\b/);
  assert.doesNotMatch(source, /\?api=/);
  assert.doesNotMatch(source, /crypto\.getRandomValues/);
  assert.equal(source.includes(["makeService", "ExchangeFrame"].join("")), false);
  assert.equal(source.includes(retiredCapability), false);
});

test("logging ui is driven by runtime projections without service-private calls", () => {
  assert.match(source, /LOGGING_SERVICE = "logging"/);
  assert.match(source, /EVENTS_NODE = "events"/);
  assert.match(source, /HEALTH_NODE = "health"/);
  assert.match(source, /DASHBOARD_NODE = "dashboard"/);
  assert.match(source, /RUNTIME_PROJECTION_CHANNELS/);
  assert.match(source, /LOGGING_SURFACE_NODES/);
  assert.match(source, /function loggingSurface\(/);
  assert.match(source, /function projectionForNode\(/);
  assert.doesNotMatch(source, /SERVICE_NODE_POLICY_PUT/);
  assert.doesNotMatch(source, /SERVICE_CATALOG_GET/);
  assert.doesNotMatch(source, /SERVICE_NODE_GET/);
  assert.doesNotMatch(source, /service\.node\.policy\.put/);
  assert.doesNotMatch(source, /service\.catalog\.get/);
  assert.doesNotMatch(source, /service\.node\.get/);
  assert.doesNotMatch(source, /function refreshLoggingServiceNodes\(/);
  assert.doesNotMatch(source, /requestLoggingNodeProjection\(nodePath\)/);
  assert.doesNotMatch(source, /SERVICE_PROJECTION_REQUEST/);
  assert.doesNotMatch(source, /PROJECTION\.CHANNEL/);
});

test("logging ui delegates shared shell controls to constitute-ui", () => {
  assert.match(source, /bindFirstPartyShellChrome/);
  assert.match(source, /renderDataTable/);
  assert.match(source, /function bindUi\(/);
  assert.match(source, /shellChrome = bindFirstPartyShellChrome\(shell/);
  assert.match(source, /onNotificationClear/);
  assert.doesNotMatch(source, /btnMenuEl\?\.\s*addEventListener\("click", openDrawer\)/);
  assert.doesNotMatch(source, /accountRailButtonEl\?\.\s*addEventListener\("click"/);
});

test("logging ui keeps transport failure text out of primary product UI", () => {
  assert.doesNotMatch(source, /Refresh Projection/);
  assert.doesNotMatch(source, /Health \/ Archive/);
  assert.doesNotMatch(source, /Logging Health/);
  assert.doesNotMatch(source, /\brefreshing\b/);
  assert.doesNotMatch(source, /\bretrying\b/);
  assert.doesNotMatch(source, /Projection unavailable/);
  assert.doesNotMatch(source, /Automatic repair is active/);
  assert.match(source, /class="loggingFreshness/);
});

test("logging ui uses composable filter command pills instead of select rows", () => {
  assert.match(source, /id="filterInput"/);
  assert.match(source, /id="filterSuggestions"/);
  assert.match(source, /id="activeFilters"/);
  assert.match(source, /function renderFilterBuilder\(/);
  assert.match(source, /function buildFilterSuggestions\(/);
  assert.match(source, /function onFilterInputKeydown\(/);
  assert.match(source, /function handleFilterBackspace\(/);
  assert.match(source, /function addActiveFilter\(/);
  assert.match(source, /LOGGING_SEVERITIES = Object\.freeze\(Object\.values\(LOGGING\.SEVERITY\)\)/);
  assert.match(source, /LOGGING_VERBOSITIES/);
  assert.match(source, /RANGE_SEPARATOR = " - "/);
  assert.match(source, /filterInputEl\.value = `\$\{definition\.key\}: \$\{suggestion\.value\}\$\{RANGE_SEPARATOR\}`/);
  assert.match(source, /activeFilters = activeFilters\.slice\(0, -1\)/);
  assert.doesNotMatch(source, /<select id="severityFilter"/);
  assert.doesNotMatch(source, /All severities/);
});

test("logging ui separates tags, non-duplicative safe facts, and encrypted details", () => {
  assert.match(source, /header: "Tags"/);
  assert.match(source, /header: "Other Facts"/);
  assert.match(source, /header: "Details"/);
  assert.match(source, /function displayTags\(/);
  assert.match(source, /function tagDuplicateKeys\(/);
  assert.match(source, /function comparableKeys\(/);
  assert.match(source, /function nonColumnSafeFacts\(/);
  assert.match(source, /function visibleColumnValues\(/);
  assert.match(source, /function encryptedDetailRefs\(/);
  assert.match(source, /function openDetailModal\(/);
  assert.match(source, /Decrypt \/ view/);
  assert.doesNotMatch(source, /function factsSummaryNode\(/);
  assert.doesNotMatch(source, /encrypted detail"\]/);
});

test("logging ui groups contiguous exact-match events without hiding individual rows", () => {
  assert.match(source, /function groupContiguousEvents\(/);
  assert.match(source, /Math\.abs\(previous\.lastTimestamp - timestamp\) <= 60/);
  assert.match(source, /function eventGroupSignature\(/);
  assert.match(source, /function renderExpandedEventGroup\(/);
  assert.match(source, /loggingRepeatToggle/);
  assert.match(source, /x\$\{row\.repeatCount\}/);
  assert.match(source, /each adjacent event is within 60 seconds/);
});

test("logging ui observes synchronized runtime projections instead of assembling pages", () => {
  assert.match(source, /DEFAULT_PROJECTION_POLICY/);
  assert.match(source, /DEFAULT_POLICY_ID = "logging\.default\.72h\.low"/);
  assert.match(source, /PROJECTION_POLICY_PUT = "projection\.policy\.put"/);
  assert.match(source, /rollingWindowHours: 72/);
  assert.match(source, /DEFAULT_SYNC_TARGET_COUNT = 2_500/);
  assert.match(source, /nodePath: EVENTS_NODE/);
  assert.match(source, /RUNTIME_PROJECTION_CHANNELS/);
  assert.match(source, /from "\.\.\/\.\.\/constitute-ui\/src\/projection-read-model\.js"/);
  assert.match(source, /selectProjectionForNode/);
  assert.match(source, /function projectionCoverage\(/);
  assert.match(source, /PROJECTION_SIGNATURE_MATERIALIZATION_BUDGET/);
  assert.match(source, /function cloneProjectionForSignature\(/);
  assert.match(source, /function projectionSignatureValue\(/);
  assert.match(source, /LOGGING_UI_PROJECTION_SELECTION_MATERIALIZATION_BUDGET_ID/);
  assert.match(source, /function projectionSelectionMaterializationBudget\(/);
  assert.match(source, /LOGGING_UI_DASHBOARD_SHORTLIST_MATERIALIZATION_BUDGET_ID/);
  assert.match(source, /function dashboardShortlistMaterializationBudget\(/);
  assert.match(source, /function validCriticalShortlist\(/);
  assert.match(source, /assertMaterializationBudget/);
  assert.doesNotMatch(source, /structuredClone\(projection\)/);
  assert.doesNotMatch(source, /JSON\.parse\(JSON\.stringify\(projection\)\)/);
  assert.match(source, /sharedProjectionCoverage\(projection/);
  assert.match(source, /function publishProjectionPolicy\(/);
  assert.match(source, /runtimeCall\(PROJECTION_POLICY_PUT, \{ policy \}\)/);
  assert.match(source, /backingChannel: String\(node\?\.backingChannel/);
  assert.doesNotMatch(source, /\.\.\.\(backingChannel \? \{ channelId: backingChannel \} : \{\}\)/);
  assert.match(source, /function projectionForNode\(/);
  assert.match(source, /function projectionNodePath\(/);
  assert.match(source, /function projectionRuntimeKey\(/);
  assert.match(source, /function markProjectionChanged\(/);
  assert.match(source, /function projectionContentSignature\(/);
  assert.match(source, /projection\.observer\.update/);
  assert.match(source, /function replaceEvents\(/);
  assert.match(source, /function mergeEvents\(/);
  assert.match(source, /function eventMaterializationKey\(/);
  assert.match(source, /LOGGING_UI_EVENT_TABLE_MATERIALIZATION_BUDGET_ID/);
  assert.match(source, /function eventTableMaterializationBudget\(/);
  assert.match(source, /function eventTableConsumerFloor\(/);
  assert.match(source, /function materializeFilteredEvents\(/);
  assert.match(source, /logging-ui\.event-table\.materialized/);
  assert.match(source, /assertConsumerFloor/);
  assert.match(source, /projectionReplacesEventSet\(nextEvents\)/);
  assert.match(source, /function coverageCountLabel\(/);
  assert.match(source, /projection\.sync\.diagnostic/);
  assert.match(source, /projection\.indexed/);
  assert.doesNotMatch(source, /targetCount \|\| syncTargetCount/);
  assert.doesNotMatch(source, /renderFilterBuilder\(\);\s*renderDashboard\(\);\s*renderSettings\(\);\s*renderProjectionStatus\(\);/s);
  assert.doesNotMatch(source, /runtimePort\.postMessage\(\{\s*type: .*SERVICE_PROJECTION_REQUEST/s);
  assert.doesNotMatch(source, /runtimeCall\(SERVICE_/);
  assert.doesNotMatch(source, /runtimeCall\("service\./);
  assert.doesNotMatch(source, /projectionRequests = new Map\(\)/);
  assert.doesNotMatch(source, /projectionInFlightByChannel = new Map\(\)/);
  assert.doesNotMatch(source, /function syncLoggingProjections\(/);
  assert.doesNotMatch(source, /function queueProjectionRequest\(/);
  assert.doesNotMatch(source, /LOGGING_EVENTS_CHUNK_SIZE/);
  assert.doesNotMatch(source, /loadOlderEvents/);
  assert.doesNotMatch(source, /paginationSentinel/);
  assert.doesNotMatch(source, /IntersectionObserver/);
  assert.doesNotMatch(source, /filters:\s*\{\s*to:/s);
});

test("logging ui renders retained runtime projections for events health and dashboard", () => {
  assert.match(source, /const nextHealth = projectionForNode\(projections, HEALTH_NODE\)/);
  assert.match(source, /healthProjection = nextHealth/);
  assert.match(source, /const nextDashboard = projectionForNode\(projections, DASHBOARD_NODE\)/);
  assert.match(source, /dashboardProjection = nextDashboard/);
  assert.match(source, /const nextEvents = projectionForNode\(projections, EVENTS_NODE\)/);
  assert.match(source, /eventsProjection = nextEvents/);
  assert.match(source, /payloadEvents\.filter\(isValidEvent\)/);
  assert.match(source, /const payload = dashboardProjection\?\.payload \|\| \{\}/);
  assert.match(source, /const health = healthProjection\?\.payload\?\.health \|\| \{\}/);
});

test("logging ui preserves active filter input during projection updates", () => {
  assert.match(source, /function preserveFilterDraft\(/);
  assert.match(source, /function restoreFilterDraft\(/);
  assert.match(source, /const draft = preserveFilterDraft\(\);\s+renderActiveFilters\(\);\s+restoreFilterDraft\(draft\);/s);
  assert.match(source, /filterInputEl\.value !== draft\.value/);
  assert.match(source, /filterInputEl\.setSelectionRange\(draft\.selectionStart, draft\.selectionEnd\)/);
  assert.doesNotMatch(source, /renderFilterBuilder\(\);\s*renderDashboard\(\);\s*renderSettings\(\);/s);
});

test("logging ui surfaces prepared projection delta and repair status", () => {
  assert.match(source, /renderProjectionSyncStatus/);
  assert.match(source, /function prepareProjectionSyncStatus\(/);
  assert.match(source, /function projectionDeltaFor\(/);
  assert.match(source, /function projectionRepairFor\(/);
  assert.match(source, /function rememberProjectionRepairRequest\(/);
  assert.match(source, /msg\.type === "projection\.repair\.request"/);
  assert.match(source, /projectionDeltaStatusLabel\(eventsProjection\)/);
  assert.match(source, /projectionRepairStatusLabel\(eventsProjection, EVENTS_NODE\)/);
  assert.match(source, /pendingDeltas/);
  assert.match(source, /repairRequested/);
});

test("logging ui presents dashboard events and settings views", () => {
  assert.match(source, /id: "dashboard", label: "Dashboard"/);
  assert.match(source, /id: "events", label: "Events"/);
  assert.match(source, /id: "settings", label: "Settings"/);
  assert.match(source, /loggingViewDashboard/);
  assert.match(source, /loggingViewEvents/);
  assert.match(source, /loggingViewSettings/);
  assert.match(source, /function renderDashboard\(/);
  assert.match(source, /Awaiting runtime projection/);
  assert.match(source, /hasAnyProjection/);
  assert.match(source, /function renderSettings\(/);
  assert.match(source, /SETTINGS_DEFAULTS/);
  assert.match(source, /Normal info", sync: "72h"/);
  assert.doesNotMatch(source, /Current Policy/);
  assert.doesNotMatch(source, /settingsPolicy/);
  assert.doesNotMatch(source, /Logging policy controls pin leases/);
});

test("logging ui exposes projection diagnostics only behind debug flag", () => {
  assert.match(source, /debugParams\.get\("debug"\) === "1"/);
  assert.match(source, /__constituteDiagnostics/);
  assert.match(source, /function emitDiagnostic\(/);
  assert.match(source, /projection\.policy\.applied/);
  assert.match(source, /projection\.coverage\.incomplete/);
  assert.match(source, /projection\.sync\.diagnostic/);
  assert.match(source, /projection\.indexed/);
  assert.match(source, /projection\.observer\.notified/);
  assert.match(source, /let lastRuntimeSnapshotDiagnosticKey = ""/);
  assert.match(source, /function emitRuntimeSnapshotDiagnostic\(snapshot\)/);
  assert.match(source, /if \(diagnosticKey === lastRuntimeSnapshotDiagnosticKey\) return/);
  assert.doesNotMatch(source, /projection\.sync\.degraded/);
  assert.doesNotMatch(source, /service\.catalog\.retained/);
  assert.doesNotMatch(source, /service\.node\.retained\.degraded/);
  assert.match(source, /projection\.repair\.request/);
  assert.match(source, /sanitizeDiagnosticDetail/);
});

test("logging ui updates shared connection surfaces from runtime state", () => {
  assert.match(source, /popConnectionEl\.textContent/);
  assert.match(source, /popRelayEl\.textContent/);
  assert.match(source, /popGatewayEl\.textContent/);
  assert.match(source, /popServicesEl\.textContent/);
  assert.match(source, /popConnectionReasonEl\.textContent/);
  assert.doesNotMatch(source, /connStateText-warning/);
});

test("logging ui attaches to the account-owned runtime worker contract", () => {
  assert.match(source, /from "\.\.\/\.\.\/constitute-account\/runtime-contract\.js"/);
  assert.match(source, /from "\.\/surface-app-contract\.js"/);
  assert.match(source, /attachContext: loggingSurfaceAttachContext/);
  assert.match(source, /runtimeSharedWorkerName/);
  assert.match(source, /accountRuntimeWorkerScriptUrl\(window\.location\.origin\)/);
  assert.match(source, /runtimeAttachDebugInfo\(window\.location\.origin\)/);
  assert.match(source, /createRuntimeSurfaceClient/);
  assert.doesNotMatch(source, /new SharedWorker/);
  assert.doesNotMatch(source, /pendingRuntimeResponses/);
  assert.doesNotMatch(source, /RUNTIME_WORKER_VERSION = Object\.freeze/);
  assert.doesNotMatch(source, /constitute-account-runtime-\$\{RUNTIME_WORKER_BUILD_ID\}/);
});

test("logging ui declares a surface app contract", async () => {
  const { loggingSurfaceApp, loggingSurfaceAttachContext } = await import("../src/surface-app-contract.js");
  assert.equal(loggingSurfaceApp.posture.state, "ready");
  assert.equal(loggingSurfaceApp.hasRole("runtimeClient"), true);
  assert.equal(loggingSurfaceApp.hasRole("projectionModel"), true);
  assert.equal(loggingSurfaceApp.hasRole("productView"), true);
  assert.equal(loggingSurfaceAttachContext.kind, "surface.app.attachContext");
  assert.equal(loggingSurfaceAttachContext.appId, "constitute-logging-ui");
});

test("logging ui renders resolved identity labels instead of raw ids", () => {
  assert.match(source, /deriveRuntimeShellState\(runtimeSnapshot, \{ context: browserStorageShellContext\(\) \}\)/);
  assert.match(source, /identityLabel: shellState\.identity\.handle/);
  assert.match(source, /accountCenterSummaryEl\.replaceChildren\(\)/);
  assert.doesNotMatch(source, /identityLabel = linked \? resolvedIdentityLabel/);
  assert.doesNotMatch(source, /handle: linked \? labelForIdentity\(identityId\)/);
});
