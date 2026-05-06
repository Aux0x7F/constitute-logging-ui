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
  assert.doesNotMatch(source, /127\.0\.0\.1:7480/);
  assert.doesNotMatch(source, /10\.0\.30\.44:7480/);
  assert.doesNotMatch(source, /\/v1\/events\/search/);
  assert.doesNotMatch(source, /\/v1\/watch/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bnew\s+WebSocket\b/);
  assert.doesNotMatch(source, /\?api=/);
  assert.doesNotMatch(source, /crypto\.getRandomValues/);
  assert.doesNotMatch(source, /makeServiceExchangeFrame/);
  assert.doesNotMatch(source, /serviceCapability/);
});

test("logging ui is driven by runtime projection channels", () => {
  assert.match(source, /PROJECTION\.CHANNEL\.LOGGING_EVENTS/);
  assert.match(source, /LOGGING_DASHBOARD/);
  assert.match(source, /PROJECTION_POLICY_PUT = "projection\.policy\.put"/);
  assert.doesNotMatch(source, /SERVICE_PROJECTION_REQUEST/);
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

test("logging ui keeps repair and health details out of primary product UI", () => {
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
  assert.match(source, /rollingWindowHours: 72/);
  assert.match(source, /DEFAULT_SYNC_TARGET_COUNT = 2_500/);
  assert.match(source, /function projectionCoverage\(/);
  assert.match(source, /if \(!projection\) \{\s+return \{\s+materializedCount: 0,\s+targetCount: 0,\s+completionRatio: 0,/s);
  assert.match(source, /function publishProjectionPolicy\(/);
  assert.match(source, /function projectionForChannel\(/);
  assert.match(source, /function markProjectionChanged\(/);
  assert.match(source, /function projectionContentSignature\(/);
  assert.match(source, /projection\.observer\.update/);
  assert.match(source, /function replaceEvents\(/);
  assert.match(source, /function mergeEvents\(/);
  assert.match(source, /function eventMaterializationKey\(/);
  assert.match(source, /projectionReplacesEventSet\(nextEvents\)/);
  assert.match(source, /function coverageCountLabel\(/);
  assert.match(source, /projection\.sync\.diagnostic/);
  assert.match(source, /projection\.indexed/);
  assert.doesNotMatch(source, /targetCount \|\| syncTargetCount/);
  assert.doesNotMatch(source, /renderFilterBuilder\(\);\s*renderDashboard\(\);\s*renderSettings\(\);\s*renderProjectionStatus\(\);/s);
  assert.doesNotMatch(source, /runtimePort\.postMessage\(\{\s*type: .*SERVICE_PROJECTION_REQUEST/s);
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
  assert.match(source, /projection\.sync\.degraded/);
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

test("logging ui renders resolved identity labels instead of raw ids", () => {
  assert.match(source, /function resolvedIdentityLabel\(/);
  assert.match(source, /identityLabel = linked \? resolvedIdentityLabel\(identity, identityId\) : "@unlinked"/);
  assert.match(source, /normalizeIdentityDisplay\(names\[rawId\], rawId\)/);
  assert.match(source, /return rawId \? "@linked" : "@unlinked"/);
  assert.doesNotMatch(source, /handle: linked \? labelForIdentity\(identityId\)/);
});
