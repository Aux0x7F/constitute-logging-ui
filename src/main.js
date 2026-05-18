import "constitute-ui/styles.css";
import "./styles.css";
import {
  bindFirstPartyShellChrome,
  renderDataTable,
  renderActionList,
  renderFirstPartyShell,
  renderProjectionSyncStatus,
  setConnectionStateText,
} from "constitute-ui";
import { LOGGING, SWARM, assertConsumerFloor, assertLogEventEnvelope, assertMaterializationBudget } from "constitute-protocol";
import {
  runtimeAttachDebugInfo,
  runtimeSharedWorkerName,
  runtimeWorkerScriptUrl as accountRuntimeWorkerScriptUrl,
} from "../../constitute-account/runtime-contract.js";
import { RUNTIME_DIAGNOSTIC_OPERATOR_PLANES, attachRuntimeDiagnostics } from "../../constitute-account/runtime-diagnostics.js";
import {
  browserStorageShellContext,
  deriveRuntimeShellState,
} from "../../constitute-ui/src/runtime-shell-state.js";
import {
  projectionCoverage as sharedProjectionCoverage,
  projectionDeltaFor as sharedProjectionDeltaFor,
  projectionNodePath as sharedProjectionNodePath,
  projectionRecordPolicyId as sharedProjectionRecordPolicyId,
  projectionRepairFor as sharedProjectionRepairFor,
  projectionRuntimeKey as sharedProjectionRuntimeKey,
  projectionUpdatedAt as sharedProjectionUpdatedAt,
  selectProjectionForNode,
} from "../../constitute-ui/src/projection-read-model.js";
import {
  materializationBudgetRecord,
  materializationBudgetLimit,
  materializationConsumerFloorRecord,
  materializationEventReplayPosture,
  requireSurfaceMaterializationBudget,
} from "../../constitute-ui/src/surface-app-contract.js";
import {
  loggingRuntimeClientModule,
  loggingSurfaceApp,
  loggingSurfaceAttachContext,
} from "./surface-app-contract.js";

const RUNTIME_ATTACH_TIMEOUT_MS = 5_000;
const RUNTIME_CALL_TIMEOUT_MS = 15_000;
const DEFAULT_SYNC_TARGET_COUNT = 2_500;
const DEFAULT_POLICY_ID = "logging.default.72h.low";
const PROJECTION_POLICY_PUT = "projection.policy.put";
const DEBUG_RING_LIMIT = 240;
const LOGGING_SERVICE = "logging";
const EVENTS_NODE = "events";
const HEALTH_NODE = "health";
const DASHBOARD_NODE = "dashboard";
const RUNTIME_PROJECTION_CHANNELS = Object.freeze({
  [EVENTS_NODE]: "logging.events",
  [HEALTH_NODE]: "logging.health",
  [DASHBOARD_NODE]: "logging.dashboard",
});
const LOGGING_SURFACE_NODES = Object.freeze([
  { path: EVENTS_NODE, nodeId: "logging.events", label: "Events", backingChannel: "logging.events" },
  { path: HEALTH_NODE, nodeId: "logging.health", label: "Health", backingChannel: "logging.health" },
  { path: DASHBOARD_NODE, nodeId: "logging.dashboard", label: "Dashboard", backingChannel: "logging.dashboard" },
]);
const LOGGING_UI_PROJECTION_SELECTION_MATERIALIZATION_BUDGET_ID = "logging-ui.projection-selection";
const LOGGING_UI_DASHBOARD_SHORTLIST_MATERIALIZATION_BUDGET_ID = "logging-ui.dashboard-shortlist";
const LOGGING_UI_EVENT_TABLE_MATERIALIZATION_BUDGET_ID = "logging-ui.event-table";
const PROJECTION_SIGNATURE_MATERIALIZATION_BUDGET = Object.freeze(requireSurfaceMaterializationBudget(loggingSurfaceApp, "logging-ui.projection-signature", {
  payloadClass: SWARM.MATERIALIZATION_PAYLOAD_CLASS.PROJECTION,
  copyRole: SWARM.MATERIALIZATION_COPY_ROLE.PROJECTION,
  transferMode: SWARM.MATERIALIZATION_TRANSFER_MODE.CLONE,
}));
const LOGGING_UI_PROJECTION_SELECTION_CONTRACT_BUDGET = Object.freeze(requireSurfaceMaterializationBudget(loggingSurfaceApp, LOGGING_UI_PROJECTION_SELECTION_MATERIALIZATION_BUDGET_ID, {
  payloadClass: SWARM.MATERIALIZATION_PAYLOAD_CLASS.PROJECTION,
  copyRole: SWARM.MATERIALIZATION_COPY_ROLE.REFERENCE_ONLY,
  transferMode: SWARM.MATERIALIZATION_TRANSFER_MODE.REFERENCE_ONLY,
}));
const LOGGING_UI_DASHBOARD_SHORTLIST_CONTRACT_BUDGET = Object.freeze(requireSurfaceMaterializationBudget(loggingSurfaceApp, LOGGING_UI_DASHBOARD_SHORTLIST_MATERIALIZATION_BUDGET_ID, {
  payloadClass: SWARM.MATERIALIZATION_PAYLOAD_CLASS.PROJECTION,
  copyRole: SWARM.MATERIALIZATION_COPY_ROLE.REFERENCE_ONLY,
  transferMode: SWARM.MATERIALIZATION_TRANSFER_MODE.REFERENCE_ONLY,
}));
const LOGGING_UI_EVENT_TABLE_CONTRACT_BUDGET = Object.freeze(requireSurfaceMaterializationBudget(loggingSurfaceApp, LOGGING_UI_EVENT_TABLE_MATERIALIZATION_BUDGET_ID, {
  payloadClass: SWARM.MATERIALIZATION_PAYLOAD_CLASS.PROJECTION,
  copyRole: SWARM.MATERIALIZATION_COPY_ROLE.REFERENCE_ONLY,
  transferMode: SWARM.MATERIALIZATION_TRANSFER_MODE.REFERENCE_ONLY,
}));
const LOGGING_UI_DASHBOARD_SHORTLIST_LIMIT = materializationBudgetLimit(LOGGING_UI_DASHBOARD_SHORTLIST_CONTRACT_BUDGET, "maxRenderedItems", 8);
const LOGGING_UI_EVENT_TABLE_EVENT_LIMIT = materializationBudgetLimit(LOGGING_UI_EVENT_TABLE_CONTRACT_BUDGET, "maxItems", 2_500);
const SYNC_STATES = Object.freeze({
  IDLE: "idle",
  SYNCING: "syncing",
  DEGRADED: "degraded",
  STALE: "stale",
  BLOCKED: "blocked",
  COMPLETE_ENOUGH: "completeEnough",
});
const LOGGING_VERBOSITIES = Object.freeze(Object.values(LOGGING.VERBOSITY_CLASS || {
  CRITICAL: "critical",
  NORMAL: "normal",
  VERBOSE: "verbose",
  NOISE: "noise",
}));
const POLICY_STORAGE_KEY = "constitute.logging.projectionPolicy.v1";
const LOGGING_SEVERITIES = Object.freeze(Object.values(LOGGING.SEVERITY));
const LOGGING_CATEGORIES = Object.freeze(Object.values(LOGGING.CATEGORY));
const LOGGING_OUTCOMES = Object.freeze(Object.values(LOGGING.OUTCOME));
const SEVERITY_RANK = new Map(LOGGING_SEVERITIES.map((severity, index) => [severity, index]));
const RANGE_SEPARATOR = " - ";
const DEFAULT_PROJECTION_POLICY = Object.freeze({
  policyId: DEFAULT_POLICY_ID,
  service: LOGGING_SERVICE,
  nodePath: EVENTS_NODE,
  scope: { range: "rolling", hours: 72, verbosity: "low" },
  rollingWindowHours: 72,
  maxVerbosityClass: "verbose",
  minSeverity: "debug",
  excludedVerbosityClasses: ["noise"],
  syncDepthTarget: { mode: "policyComplete", targetCount: DEFAULT_SYNC_TARGET_COUNT },
  retentionTarget: {
    critical: "forever",
    errorWarning: "90d",
    normalInfo: "48h",
    verboseNoise: "12h",
  },
});
const SETTINGS_DEFAULTS = Object.freeze([
  { key: "critical", label: "Critical", sync: "30d", retain: "forever" },
  { key: "errorWarning", label: "Error / warn", sync: "7d", retain: "90d" },
  { key: "normalInfo", label: "Normal info", sync: "72h", retain: "48h" },
  { key: "verboseNoise", label: "Verbose / noise", sync: "12h when enabled", retain: "12h" },
]);
const FILTER_DEFINITIONS = Object.freeze([
  { key: "time", label: "Time", aliases: ["date"], range: true },
  { key: "severity", label: "Severity", aliases: ["level"], range: true },
  { key: "category", label: "Category", aliases: ["type"] },
  { key: "outcome", label: "Outcome", aliases: ["result"] },
  { key: "verbosity", label: "Verbosity" },
  { key: "source", label: "Source", aliases: ["producer"] },
  { key: "subject", label: "Subject" },
  { key: "tag", label: "Tag", aliases: ["tags"] },
  { key: "fact", label: "Fact", aliases: ["safeFact", "safeFacts"] },
  { key: "resource", label: "Resource" },
  { key: "correlation", label: "Correlation", aliases: ["trace"] },
]);
const FILTER_DEFINITION_BY_KEY = new Map(FILTER_DEFINITIONS.map((definition) => [definition.key, definition]));
const COLUMN_SAFE_FACT_KEYS = new Set([
  "category",
  "component",
  "eventid",
  "level",
  "occurredat",
  "outcome",
  "producer",
  "producercomponent",
  "producerservice",
  "resource",
  "resourcedisplay",
  "resourceid",
  "service",
  "severity",
  "source",
  "subject",
  "subjectdisplay",
  "subjectid",
  "tag",
  "tags",
  "time",
  "timestamp",
]);

const MAIN_HTML = `
  <div class="loggingMain">
    <section id="loggingViewDashboard" class="loggingView">
      <section class="cuPanel">
        <div class="cuPanelHeader">
          <div>
            <h2 class="cuPanelTitle">Dashboard</h2>
          </div>
        </div>
        <div id="dashboardCards" class="loggingDashboardGrid"></div>
        <div class="loggingDashboardSplit">
          <section class="loggingDashboardPanel">
            <h3>Critical / Error Shortlist</h3>
            <div id="dashboardShortlist" class="loggingShortlist"></div>
          </section>
          <section class="loggingDashboardPanel">
            <h3>Sync Coverage</h3>
            <div id="dashboardCoverage" class="loggingSummaryRows"></div>
          </section>
          <section class="loggingDashboardPanel">
            <h3>Storage / Archive</h3>
            <div id="dashboardStorage" class="loggingSummaryRows"></div>
          </section>
        </div>
      </section>
    </section>
    <section id="loggingViewEvents" class="loggingView hidden">
      <section class="cuPanel">
        <div class="cuPanelHeader">
          <div class="loggingTitleLine">
            <h2 class="cuPanelTitle">Events</h2>
            <span id="freshnessIndicator" class="loggingFreshness loggingFreshness-missing" tabindex="0" aria-label="Projection freshness"></span>
            <div id="freshnessPopover" class="loggingFreshnessPopover" role="status"></div>
          </div>
        </div>
        <div class="loggingFilterBuilder">
          <label class="loggingField loggingFilterInputField">Filter
            <div class="loggingCommandWrap">
              <input
                id="filterInput"
                class="loggingInput loggingCommandInput"
                placeholder='type severity, tag, or any search term'
                autocomplete="off"
                spellcheck="false"
              />
              <div id="filterSuggestions" class="loggingSuggestions hidden" role="listbox" aria-label="Filter suggestions"></div>
            </div>
          </label>
          <div id="activeFilters" class="loggingFilterPills" aria-live="polite"></div>
        </div>
        <div id="eventList" class="loggingTableHost"></div>
      </section>
    </section>
    <section id="loggingViewSettings" class="loggingView hidden">
      <section class="cuPanel">
        <div class="cuPanelHeader">
          <div>
            <h2 class="cuPanelTitle">Settings</h2>
          </div>
        </div>
        <div class="loggingSettingsGrid">
          <section class="loggingSettingsPanel">
            <h3>Sync Depth</h3>
            <div id="settingsSync" class="loggingSettingsTable"></div>
          </section>
          <section class="loggingSettingsPanel">
            <h3>Retention Policy</h3>
            <div id="settingsRetention" class="loggingSettingsTable"></div>
          </section>
        </div>
      </section>
    </section>
  </div>
  <div id="detailModalBackdrop" class="loggingModalBackdrop hidden"></div>
  <section id="detailModal" class="loggingModal hidden" role="dialog" aria-modal="true" aria-labelledby="detailModalTitle">
    <div class="loggingModalHeader">
      <div>
        <h2 id="detailModalTitle" class="loggingModalTitle">Details</h2>
        <div id="detailModalSubtitle" class="loggingModalSubtitle"></div>
      </div>
      <button id="detailModalClose" class="loggingModalClose" type="button" aria-label="Close details">Close</button>
    </div>
    <div id="detailModalBody" class="loggingModalBody"></div>
  </section>
`;

const app = document.querySelector("#app");
if (!app) throw new Error("#app not found");

const shell = renderFirstPartyShell(app, {
  appName: "Logging",
  navItems: [
    { id: "dashboard", label: "Dashboard", active: true },
    { id: "events", label: "Events" },
    { id: "settings", label: "Settings" },
  ],
  mainHtml: MAIN_HTML,
  accountCenterTitle: "",
});

const bootSplashEl = document.getElementById("bootSplash");
const viewDashboardEl = document.getElementById("loggingViewDashboard");
const viewEventsEl = document.getElementById("loggingViewEvents");
const viewSettingsEl = document.getElementById("loggingViewSettings");
const dashboardCardsEl = document.getElementById("dashboardCards");
const dashboardShortlistEl = document.getElementById("dashboardShortlist");
const dashboardCoverageEl = document.getElementById("dashboardCoverage");
const dashboardStorageEl = document.getElementById("dashboardStorage");
const filterInputEl = document.getElementById("filterInput");
const filterSuggestionsEl = document.getElementById("filterSuggestions");
const activeFiltersEl = document.getElementById("activeFilters");
const eventListEl = document.getElementById("eventList");
const freshnessIndicatorEl = document.getElementById("freshnessIndicator");
const freshnessPopoverEl = document.getElementById("freshnessPopover");
const settingsSyncEl = document.getElementById("settingsSync");
const settingsRetentionEl = document.getElementById("settingsRetention");
const detailModalBackdropEl = document.getElementById("detailModalBackdrop");
const detailModalEl = document.getElementById("detailModal");
const detailModalCloseEl = document.getElementById("detailModalClose");
const detailModalSubtitleEl = document.getElementById("detailModalSubtitle");
const detailModalBodyEl = document.getElementById("detailModalBody");
const btnBellEl = shell.btnBellEl;
const notifListEl = shell.notifListEl;
const accountCenterSummaryEl = shell.accountCenterSummaryEl;
const accountCenterActionsEl = shell.accountCenterActionsEl;
const identityHandleEl = shell.identityHandleEl;
const connStateTextEl = shell.connStateTextEl;
const popConnectionEl = shell.popConnectionEl;
const popRelayEl = shell.popRelayEl;
const popGatewayEl = shell.popGatewayEl;
const popServicesEl = shell.popServicesEl;
const popConnectionReasonEl = shell.popConnectionReasonEl;

let runtimeDiagnosticsAgent = null;
let runtimeSnapshot = null;
let runtimeReady = false;
let runtimeClient = null;
let bootSplashDismissed = false;
let accountBridgeFrame = null;
let accountBridgePromise = null;
let eventsProjection = null;
let healthProjection = null;
let dashboardProjection = null;
let events = [];
let activeView = "dashboard";
let activeFilters = [];
let filterSuggestions = [];
let activeSuggestionIndex = 0;
let projectionPolicy = loadProjectionPolicy();
let lastPublishedPolicyKey = "";
let lastRuntimeSnapshotDiagnosticKey = "";
const lastProjectionSignatures = new Map();
const projectionRepairRequests = new Map();
const notifications = [];
const expandedEventGroups = new Set();
let lastProjectionSelectionMaterializationBudget = null;
let lastDashboardShortlistMaterializationBudget = null;
let lastEventTableMaterializationBudget = null;
let lastEventTableMaterializationDiagnosticKey = "";
let lastEventFabricDiagnosticKey = "";
let runtimeSnapshotConsumerFloor = null;
let lastRuntimeConsumerFloorDiagnosticKey = "";
let shellChrome = null;
const debugParams = new URLSearchParams(window.location.search || "");
const debugEnabled = debugParams.get("debug") === "1" || debugParams.get("debug") === "true";

filterInputEl?.addEventListener("input", () => renderFilterBuilder());
filterInputEl?.addEventListener("focus", () => renderFilterSuggestions());
filterInputEl?.addEventListener("keydown", onFilterInputKeydown);
document.addEventListener("click", (event) => {
  if (!filterSuggestionsEl || !filterInputEl) return;
  const target = event.target;
  if (target instanceof Node && (filterSuggestionsEl.contains(target) || filterInputEl.contains(target))) return;
  hideFilterSuggestions();
});

detailModalCloseEl?.addEventListener("click", closeDetailModal);
detailModalBackdropEl?.addEventListener("click", closeDetailModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !detailModalEl?.classList.contains("hidden")) closeDetailModal();
});

boot().catch((error) => {
  console.warn("[logging-ui] boot failed", error);
  dismissBootSplash();
});

async function boot() {
  attachRuntime();
  void ensureAccountBridge("logging-ui startup");
  window.setTimeout(() => {
    if (!bootSplashDismissed) dismissBootSplash();
  }, RUNTIME_ATTACH_TIMEOUT_MS);
}

function runtimeWorkerUrl() {
  return accountRuntimeWorkerScriptUrl(window.location.origin);
}

function accountBridgeUrl() {
  const target = new URL("/constitute-account/", window.location.origin);
  target.searchParams.set("bridge", "1");
  return target.toString();
}

async function ensureAccountBridge(reason = "") {
  if (accountBridgePromise) return await accountBridgePromise;
  accountBridgePromise = new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    accountBridgeFrame = document.getElementById("constituteAccountBridge");
    if (!accountBridgeFrame) {
      const iframe = document.createElement("iframe");
      iframe.id = "constituteAccountBridge";
      iframe.hidden = true;
      iframe.tabIndex = -1;
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
      iframe.src = accountBridgeUrl();
      iframe.addEventListener("load", () => window.setTimeout(done, 450), { once: true });
      document.body.appendChild(iframe);
      console.info("[logging-ui] account bridge", reason);
      return;
    }
    window.setTimeout(done, 150);
  });
  return await accountBridgePromise;
}

function attachRuntime() {
  if (typeof SharedWorker === "undefined") {
    renderProjectionStatus();
    return null;
  }
  runtimeClient = loggingRuntimeClientModule.createRuntimeSurfaceClient({
    clientId: "logging-ui",
    surface: "logging-ui",
    workerUrl: runtimeWorkerUrl(),
    workerName: runtimeSharedWorkerName(),
    attachTimeoutMs: RUNTIME_ATTACH_TIMEOUT_MS,
    callTimeoutMs: RUNTIME_CALL_TIMEOUT_MS,
    debug: debugEnabled,
    debugInfo: runtimeAttachDebugInfo(window.location.origin),
    logPrefix: "logging-ui",
    attachContext: loggingSurfaceAttachContext,
    onPort: (port) => {
      runtimeDiagnosticsAgent = attachRuntimeDiagnostics({
        port,
        surface: "constitute-logging-ui",
        clientId: "logging-ui",
        enabled: debugEnabled,
        planes: RUNTIME_DIAGNOSTIC_OPERATOR_PLANES,
        minLevelByPlane: { diagnostic: "warn" },
        denyKinds: ["projection.applied", "projection.ignored"],
      });
    },
    onMessage: (msg) => {
      if (runtimeDiagnosticsAgent?.handleMessage(msg)) return true;
      if (msg.type === "runtime.attached" || msg.type === "runtime.snapshot") {
        return false;
      }
      if (msg.type === "projection.observer.update") {
        const projection = msg.projection && typeof msg.projection === "object" ? msg.projection : null;
        emitDiagnostic("projection.observer.notified", {
          projectionKey: msg.update?.projectionKey || "",
          projectionChannel: projection?.channelId || "",
          nodePath: projectionNodePath(projection),
          changedCount: msg.update?.changedCount || 0,
          coverage: msg.update?.coverage || null,
        });
        const key = projectionRuntimeKey(projection, msg.update?.projectionKey);
        if (key) {
          applyProjectionSnapshot({ [key]: projection });
        }
        return true;
      }
      if (msg.type === "projection.repair.request") {
        rememberProjectionRepairRequest(msg.repairRequest, msg.frame);
        renderProjectionStatus();
        renderDashboard();
        return true;
      }
      if (msg.type === "projection.sync.diagnostic") {
        return true;
      }
      return false;
    },
    onSnapshot: (snapshot) => {
      absorbRuntimeSnapshot(snapshot || null);
      dismissBootSplash();
    },
    onConsumerFloor: (floor) => {
      runtimeSnapshotConsumerFloor = floor && typeof floor === "object" ? floor : null;
      const diagnosticKey = JSON.stringify({
        floorId: runtimeSnapshotConsumerFloor?.floorId || "",
        lagState: runtimeSnapshotConsumerFloor?.lagState || "",
        ackFloor: runtimeSnapshotConsumerFloor?.ackFloor || "",
        witnessFloor: runtimeSnapshotConsumerFloor?.witnessFloor || "",
      });
      if (diagnosticKey !== lastRuntimeConsumerFloorDiagnosticKey) {
        lastRuntimeConsumerFloorDiagnosticKey = diagnosticKey;
        emitDiagnostic("logging-ui.runtime.consumer-floor", {
          floorId: runtimeSnapshotConsumerFloor?.floorId || "",
          lagState: runtimeSnapshotConsumerFloor?.lagState || "",
          ackFloor: runtimeSnapshotConsumerFloor?.ackFloor || "",
          witnessFloor: runtimeSnapshotConsumerFloor?.witnessFloor || "",
          compactionFloor: runtimeSnapshotConsumerFloor?.compactionFloor || "",
        });
      }
    },
    onWorkerError: () => {
      renderProjectionStatus();
      void ensureAccountBridge("runtime worker recovery");
    },
    onAttachError: (error) => {
      console.warn("[logging-ui] runtime attach failed", error);
      renderProjectionStatus();
    },
  });
  return runtimeClient.attach();
}

function runtimeCall(type, payload = {}, timeoutMs = RUNTIME_CALL_TIMEOUT_MS) {
  return runtimeClient?.call(type, payload, timeoutMs)
    || Promise.reject(new Error("shared runtime is unavailable"));
}

function absorbRuntimeSnapshot(snapshot) {
  runtimeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : null;
  runtimeReady = Boolean(runtimeSnapshot);
  emitRuntimeSnapshotDiagnostic(runtimeSnapshot);
  renderRuntimeState();
  applyProjectionSnapshot(runtimeSnapshot?.projections || {});
  publishProjectionPolicy();
  if (projectionCoverage(eventsProjection).completionRatio < 1) {
    emitDiagnostic("projection.coverage.incomplete", {
      coverage: projectionCoverage(eventsProjection),
      policyId: projectionPolicy.policyId,
    });
  }
}

function emitRuntimeSnapshotDiagnostic(snapshot) {
  const projectionKeys = Object.keys(snapshot?.projections || {}).sort();
  const diagnosticKey = JSON.stringify({
    projectionKeys,
    brokerAvailable: runtimeBrokerAvailable(),
    runtimeSessionId: snapshot?.runtimeSessionId || "",
  });
  if (diagnosticKey === lastRuntimeSnapshotDiagnosticKey) return;
  lastRuntimeSnapshotDiagnosticKey = diagnosticKey;
  emitDiagnostic("logging-ui.runtime.snapshot.received", {
    projectionCount: projectionKeys.length,
    brokerAvailable: runtimeBrokerAvailable(),
  });
}

function runtimeBrokerAvailable() {
  return runtimeSnapshot?.broker?.available === true;
}

function applyProjectionSnapshot(projections) {
  let projectionChanged = false;
  const nextHealth = projectionForNode(projections, HEALTH_NODE);
  if (nextHealth && markProjectionChanged(HEALTH_NODE, nextHealth)) {
    healthProjection = nextHealth;
    projectionChanged = true;
  }
  const nextDashboard = projectionForNode(projections, DASHBOARD_NODE);
  if (nextDashboard && markProjectionChanged(DASHBOARD_NODE, nextDashboard)) {
    dashboardProjection = nextDashboard;
    projectionChanged = true;
  }
  const nextEvents = projectionForNode(projections, EVENTS_NODE);
  if (nextEvents && markProjectionChanged(EVENTS_NODE, nextEvents)) {
    eventsProjection = nextEvents;
    const payloadEvents = Array.isArray(nextEvents?.payload?.events) ? nextEvents.payload.events : [];
    const projectionEvents = payloadEvents.filter(isValidEvent);
    const merge = projectionReplacesEventSet(nextEvents)
      ? replaceEvents(projectionEvents)
      : mergeEvents(projectionEvents);
    emitDiagnostic("projection.indexed", {
      received: projectionEvents.length,
      added: merge.added,
      updated: merge.updated,
      removed: merge.removed || 0,
      materialized: events.length,
      coverage: projectionCoverage(nextEvents),
    });
    projectionChanged = true;
  }
  if (!projectionChanged) return;
  renderFilterBuilder();
  renderDashboard();
  renderProjectionStatus();
  emitDiagnostic("logging-ui.projection.applied", {
    materialized: events.length,
    coverage: projectionCoverage(eventsProjection),
  });
}

function markProjectionChanged(nodePath, projection) {
  const signature = projectionContentSignature(projection);
  if (!signature) return false;
  if (lastProjectionSignatures.get(nodePath) === signature) return false;
  lastProjectionSignatures.set(nodePath, signature);
  return true;
}

function loggingSurface() {
  return {
    surfaceId: "logging.surface",
    service: LOGGING_SERVICE,
    nodes: LOGGING_SURFACE_NODES,
  };
}

function loggingNode(nodePath) {
  const target = String(nodePath || "").trim().toLowerCase();
  const surface = loggingSurface();
  const nodes = Array.isArray(surface?.nodes) ? surface.nodes : [];
  return nodes.find((node) => {
    const aliases = Array.isArray(node?.aliases) ? node.aliases : [];
    return [node?.path, node?.nodePath, node?.nodeId, node?.label, ...aliases]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
      .includes(target);
  }) || null;
}

function projectionForNode(projections, nodePath) {
  const target = String(nodePath || "").trim().toLowerCase();
  const node = loggingNode(nodePath);
  const selected = selectProjectionForNode(projections, target, {
    backingChannel: String(node?.backingChannel || "").trim(),
    channelMap: RUNTIME_PROJECTION_CHANNELS,
    policyId: projectionPolicyForNode(nodePath).policyId,
  });
  lastProjectionSelectionMaterializationBudget = projectionSelectionMaterializationBudget(nodePath, selected.examined, selected.matched);
  return selected.projection;
}

function projectionRuntimeKey(projection, fallback = "") {
  return sharedProjectionRuntimeKey(projection, fallback);
}

function projectionNodePath(projection) {
  return sharedProjectionNodePath(projection, { channelMap: RUNTIME_PROJECTION_CHANNELS });
}

function projectionContentSignature(projection) {
  try {
    return JSON.stringify(projectionSemanticShape(projection));
  } catch {
    return "";
  }
}

function cloneProjectionForSignature(projection, materializationBudget = PROJECTION_SIGNATURE_MATERIALIZATION_BUDGET) {
  if (!projection || typeof projection !== "object") return {};
  if (materializationBudget?.transferMode === SWARM.MATERIALIZATION_TRANSFER_MODE.REFERENCE_ONLY) return projection;
  return projectionSignatureValue(projection);
}

function projectionSignatureValue(value, path = "") {
  if (Array.isArray(value)) return value.map((item) => projectionSignatureValue(item, path));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "retainedAt" || key === "requestId") continue;
    if (path === "cursor" && key === "updatedAt") continue;
    if (path === "freshness" && (key === "updatedAt" || key === "staleAfter")) continue;
    out[key] = projectionSignatureValue(child, key);
  }
  return out;
}

function projectionSemanticShape(projection) {
  return cloneProjectionForSignature(projection);
}

function projectionReplacesEventSet(projection) {
  return Array.isArray(projection?.payload?.events)
    && Boolean(projection?.payload?.policy || projection?.scope || projection?.payload?.coverage);
}

function projectionCoverage(projection = eventsProjection) {
  const nodePath = String(projection?.nodePath || projection?.payload?.nodePath || "").trim().toLowerCase();
  const isEventProjection = nodePath === EVENTS_NODE || Array.isArray(projection?.payload?.events);
  const fallbackMaterialized = isEventProjection ? events.length : (projection ? 1 : 0);
  return sharedProjectionCoverage(projection, {
    materializedFallback: fallbackMaterialized,
    targetFallback: fallbackMaterialized,
    syncStateFallback: projection
    ? (isEventProjection ? SYNC_STATES.SYNCING : SYNC_STATES.COMPLETE_ENOUGH)
    : SYNC_STATES.STALE,
  });
}

function prepareProjectionSyncStatus(projection, nodePath = EVENTS_NODE) {
  const coverage = projectionCoverage(projection);
  const delta = projectionDeltaFor(projection);
  const repair = projectionRepairFor(projection, nodePath);
  const updatedAt = Number(projection?.freshness?.updatedAt || projection?.retainedAt || projection?.cursor?.updatedAt || 0);
  const freshnessState = String(projection?.freshness?.state || "").trim().toLowerCase();
  const syncState = String(coverage.syncState || "").trim().toLowerCase();
  const pendingDeltas = Number(
    projection?.pendingDeltas
      || projection?.deltaStatus?.pendingDeltas
      || projection?.payload?.deltaStatus?.pendingDeltas
      || 0,
  );
  const repairPending = Boolean(repair);
  return {
    projectionId: String(projection?.projectionId || delta?.projectionId || projection?.channelId || `${LOGGING_SERVICE}.${nodePath}`).trim(),
    revision: String(projection?.revision || delta?.revision || projection?.payload?.revision || ""),
    stale: freshnessState === "stale" || syncState === "stale",
    gap: repairPending || syncState === SYNC_STATES.BLOCKED.toLowerCase() || syncState === "gap",
    pending: syncState === SYNC_STATES.SYNCING.toLowerCase() || pendingDeltas > 0,
    pendingDeltas,
    repair: repairPending,
    repairPending,
    repairRequested: repairPending,
    lastAppliedAt: updatedAt ? formatEventTime(updatedAt) : "",
  };
}

function projectionDeltaFor(projection) {
  return sharedProjectionDeltaFor(projection);
}

function rememberProjectionRepairRequest(repairRequest, frame = null) {
  if (!repairRequest || typeof repairRequest !== "object") return;
  const projectionId = String(repairRequest.projectionId || repairRequest.projection_id || frame?.channelId || "").trim();
  if (!projectionId) return;
  projectionRepairRequests.set(projectionId, {
    repairRequest,
    frame,
    requestedAt: Date.now(),
  });
  emitDiagnostic("projection.repair.request", {
    projectionId,
    currentRevision: repairRequest.currentRevision || repairRequest.current_revision || "",
    targetRevision: repairRequest.targetRevision || repairRequest.target_revision || "",
  });
}

function projectionRepairFor(projection, nodePath = EVENTS_NODE) {
  const target = String(nodePath || "").trim().toLowerCase();
  const edgeRequests = Array.isArray(runtimeSnapshot?.edge?.repairRequests) ? runtimeSnapshot.edge.repairRequests : [];
  return sharedProjectionRepairFor(projection, {
    nodePath: target,
    channelMap: RUNTIME_PROJECTION_CHANNELS,
    service: LOGGING_SERVICE,
    repairRequests: edgeRequests,
    localRepairRequests: projectionRepairRequests,
  });
}

function projectionDeltaStatusLabel(projection) {
  const delta = projectionDeltaFor(projection);
  if (!delta) return "";
  const revision = delta.revision ?? "";
  const baseRevision = delta.baseRevision ?? delta.base_revision ?? "";
  if (revision !== "" && baseRevision !== "") return `${baseRevision} -> ${revision}`;
  if (revision !== "") return `r${revision}`;
  return "ready";
}

function projectionRepairStatusLabel(projection, nodePath = EVENTS_NODE) {
  const repair = projectionRepairFor(projection, nodePath);
  if (!repair) return "";
  const current = repair.currentRevision ?? repair.current_revision ?? "";
  const target = repair.targetRevision ?? repair.target_revision ?? "";
  if (current !== "" || target !== "") return `${current || "?"} -> ${target || "?"}`;
  return "requested";
}

function projectionUpdatedAt(projection) {
  return sharedProjectionUpdatedAt(projection);
}

function projectionRecordPolicyId(projection) {
  return sharedProjectionRecordPolicyId(projection);
}

function publishProjectionPolicy({ force = false } = {}) {
  if (!runtimeReady) return;
  const policyKey = JSON.stringify(projectionPolicy);
  if (!force && lastPublishedPolicyKey === policyKey) return;
  lastPublishedPolicyKey = policyKey;
  for (const node of LOGGING_SURFACE_NODES) {
    const policy = projectionPolicyForNode(node.path);
    emitDiagnostic("projection.policy.applied", {
      policyId: policy.policyId,
      service: policy.service,
      nodePath: policy.nodePath,
      backingChannel: node.backingChannel,
    });
    runtimeCall(PROJECTION_POLICY_PUT, { policy }).catch((error) => {
      emitDiagnostic("projection.policy.rejected", {
        policyId: policy.policyId,
        service: policy.service,
        nodePath: policy.nodePath,
        error: String(error?.message || error || "projection policy rejected"),
      });
    });
  }
}

function projectionPolicyForNode(nodePath) {
  const target = String(nodePath || EVENTS_NODE).trim();
  const node = LOGGING_SURFACE_NODES.find((candidate) => candidate.path === target);
  const backingChannel = String(node?.backingChannel || RUNTIME_PROJECTION_CHANNELS[target] || "").trim();
  return {
    ...projectionPolicy,
    nodePath: target,
    policyId: target === EVENTS_NODE
      ? projectionPolicy.policyId
      : `${projectionPolicy.policyId}.${target.replace(/[^a-z0-9]+/gi, ".")}`,
    service: LOGGING_SERVICE,
  };
}

function syncTargetCount(policy = projectionPolicy) {
  const target = Number(policy?.syncDepthTarget?.targetCount || DEFAULT_SYNC_TARGET_COUNT);
  return Number.isFinite(target) && target > 0 ? Math.min(target, 5_000) : DEFAULT_SYNC_TARGET_COUNT;
}

function loadProjectionPolicy() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(POLICY_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      return normalizeProjectionPolicy(saved);
    }
  } catch {
    // Ignore corrupt local policy and fall back to contract defaults.
  }
  return normalizeProjectionPolicy(DEFAULT_PROJECTION_POLICY);
}

function saveProjectionPolicy(nextPolicy) {
  projectionPolicy = normalizeProjectionPolicy(nextPolicy);
  try {
    window.localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(projectionPolicy));
  } catch {
    // Local persistence is best-effort; runtime sync still receives the policy.
  }
  renderSettings();
  renderProjectionStatus();
  publishProjectionPolicy({ force: true });
}

function normalizeProjectionPolicy(policy) {
  const sourcePolicy = policy && typeof policy === "object" ? policy : {};
  const targetCount = syncTargetCount({
    syncDepthTarget: sourcePolicy?.syncDepthTarget || DEFAULT_PROJECTION_POLICY.syncDepthTarget,
  });
  return {
    ...DEFAULT_PROJECTION_POLICY,
    ...sourcePolicy,
    service: LOGGING_SERVICE,
    nodePath: EVENTS_NODE,
    policyId: String(sourcePolicy?.policyId || DEFAULT_PROJECTION_POLICY.policyId).trim() || DEFAULT_PROJECTION_POLICY.policyId,
    scope: {
      ...DEFAULT_PROJECTION_POLICY.scope,
      ...(sourcePolicy?.scope && typeof sourcePolicy.scope === "object" ? sourcePolicy.scope : {}),
    },
    rollingWindowHours: Number(sourcePolicy?.rollingWindowHours || DEFAULT_PROJECTION_POLICY.rollingWindowHours),
    excludedVerbosityClasses: Array.isArray(sourcePolicy?.excludedVerbosityClasses)
      ? sourcePolicy.excludedVerbosityClasses.filter(Boolean)
      : [...DEFAULT_PROJECTION_POLICY.excludedVerbosityClasses],
    syncDepthTarget: {
      ...DEFAULT_PROJECTION_POLICY.syncDepthTarget,
      ...(sourcePolicy?.syncDepthTarget && typeof sourcePolicy.syncDepthTarget === "object" ? sourcePolicy.syncDepthTarget : {}),
      targetCount,
    },
    retentionTarget: {
      ...DEFAULT_PROJECTION_POLICY.retentionTarget,
      ...(sourcePolicy?.retentionTarget && typeof sourcePolicy.retentionTarget === "object" ? sourcePolicy.retentionTarget : {}),
    },
  };
}

function replaceEvents(nextEvents) {
  const previousByKey = new Map();
  for (const event of events) {
    const key = eventMaterializationKey(event);
    if (key) previousByKey.set(key, event);
  }
  const nextByKey = new Map();
  let received = 0;
  let added = 0;
  let updated = 0;
  for (const event of nextEvents) {
    if (!isValidEvent(event)) continue;
    received += 1;
    const key = eventMaterializationKey(event);
    if (!key) continue;
    const existing = previousByKey.get(key);
    if (existing) {
      const merged = mergeEventRecord(existing, event);
      if (JSON.stringify(merged) !== JSON.stringify(existing)) updated += 1;
      nextByKey.set(key, merged);
      continue;
    }
    nextByKey.set(key, event);
    added += 1;
  }
  events = Array.from(nextByKey.values());
  events.sort((left, right) => eventTimeSeconds(right) - eventTimeSeconds(left));
  const removed = Math.max(0, previousByKey.size - nextByKey.size);
  return { received, added, updated, removed, materialized: events.length };
}

function mergeEvents(nextEvents) {
  const byKey = new Map();
  for (const event of events) {
    const key = eventMaterializationKey(event);
    if (!key) continue;
    byKey.set(key, event);
  }
  let received = 0;
  let added = 0;
  let updated = 0;
  for (const event of nextEvents) {
    if (!isValidEvent(event)) continue;
    received += 1;
    const key = eventMaterializationKey(event);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      const merged = mergeEventRecord(existing, event);
      if (JSON.stringify(merged) !== JSON.stringify(existing)) {
        byKey.set(key, merged);
        updated += 1;
      }
      continue;
    }
    byKey.set(key, event);
    added += 1;
  }
  events = Array.from(byKey.values());
  events.sort((left, right) => eventTimeSeconds(right) - eventTimeSeconds(left));
  return { received, added, updated, materialized: events.length };
}

function eventMaterializationKey(event) {
  const direct = String(event?.eventId || event?.event_id || event?.logEventId || event?.id || "").trim();
  if (direct) return `id:${direct}`;
  const cursor = String(event?.cursor?.value || event?.cursor || "").trim();
  if (cursor) return `cursor:${cursor}`;
  try {
    return `shape:${JSON.stringify({
      occurredAt: event?.occurredAt || event?.occurred_at || event?.ts || "",
      severity: event?.severity || "",
      category: event?.category || "",
      outcome: event?.outcome || "",
      producer: event?.producer || "",
      subject: event?.subject || null,
      resource: event?.resource || null,
      correlation: event?.correlation || null,
      tags: event?.tags || [],
      safeFacts: event?.safeFacts || event?.safe_facts || {},
    })}`;
  } catch {
    return "";
  }
}

function mergeEventRecord(existing, next) {
  const existingFacts = existing?.safeFacts || existing?.safe_facts || {};
  const nextFacts = next?.safeFacts || next?.safe_facts || {};
  return {
    ...existing,
    ...next,
    safeFacts: {
      ...(existingFacts && typeof existingFacts === "object" ? existingFacts : {}),
      ...(nextFacts && typeof nextFacts === "object" ? nextFacts : {}),
    },
    encryptedDetailRefs: [
      ...encryptedDetailRefs(existing),
      ...encryptedDetailRefs(next),
    ].filter((ref, index, refs) => {
      const key = JSON.stringify(ref);
      return refs.findIndex((candidate) => JSON.stringify(candidate) === key) === index;
    }),
  };
}

function renderRuntimeState() {
  const shellState = deriveRuntimeShellState(runtimeSnapshot, { context: browserStorageShellContext() });

  identityHandleEl.textContent = shellState.identity.handle;
  identityHandleEl.classList.toggle("identityHandle-linked", shellState.identity.linked);
  identityHandleEl.classList.toggle("identityHandle-unlinked", !shellState.identity.linked);
  identityHandleEl.title = shellState.identity.title;
  identityHandleEl.setAttribute("aria-label", shellState.identity.ariaLabel);

  renderAccountCenter({
    identityId: shellState.identity.identityId,
    identityLabel: shellState.identity.handle,
    linked: shellState.identity.linked,
    connectionLabel: shellState.connection.label,
    connectionCode: shellState.connection.code,
  });
  setConnectionStateText(connStateTextEl, {
    label: shellState.connection.label,
    toneClass: shellState.connection.toneClass,
  });
  popConnectionEl.textContent = shellState.connection.label;
  popRelayEl.textContent = shellState.relay.state || (runtimeReady ? "pending" : "attaching");
  popGatewayEl.textContent = shellState.gateway.state;
  popServicesEl.textContent = shellState.services.state;
  popConnectionReasonEl.textContent = shellState.connection.reason || "Waiting for account runtime projection.";
}

function renderAccountCenter({
  identityId = "",
  identityLabel = "@unlinked",
  linked = false,
  connectionLabel = "Pending",
  connectionCode = "connecting",
} = {}) {
  accountCenterSummaryEl.replaceChildren();
  renderActionList(accountCenterActionsEl, [
    {
      id: "account.open_center",
      label: "Open Account Center",
      description: "Open constitute-account.",
      onSelect: () => {
        shellChrome?.closeAccountCenter();
        window.location.assign(new URL("/constitute-account/#activity=home", window.location.origin).toString());
      },
    },
  ]);
}

function renderProjectionStatus() {
  const hasProjection = Boolean(eventsProjection);
  const coverage = projectionCoverage(eventsProjection);
  const count = hasProjection ? coverage.materializedCount : 0;
  const target = hasProjection ? coverage.targetCount : 0;
  const percent = hasProjection ? Math.round(coverage.completionRatio * 100) : 0;
  const syncActive = coverage.syncState === SYNC_STATES.SYNCING;
  const freshness = eventsProjection?.freshness?.state || (syncActive ? "stale" : "missing");
  const tone = freshness === "fresh"
    ? "fresh"
    : (freshness === "stale" || syncActive ? "stale" : "missing");
  freshnessIndicatorEl?.classList.remove(
    "loggingFreshness-fresh",
    "loggingFreshness-stale",
    "loggingFreshness-missing",
  );
  freshnessIndicatorEl?.classList.add(`loggingFreshness-${tone}`);
  const updatedAt = Number(eventsProjection?.freshness?.updatedAt || eventsProjection?.retainedAt || 0);
  const updated = updatedAt ? formatEventTime(updatedAt) : "not retained yet";
  const syncState = syncActive ? SYNC_STATES.SYNCING : coverage.syncState;
  const status = syncState === SYNC_STATES.COMPLETE_ENOUGH
    ? "Complete enough"
    : titleCaseWords(syncState || (eventsProjection ? "stale" : "waiting"));
  if (freshnessIndicatorEl) {
    freshnessIndicatorEl.setAttribute(
      "aria-label",
      hasProjection ? `${status}. ${coverageCountLabel(count, target)}.` : "Awaiting runtime projection.",
    );
  }
  if (freshnessPopoverEl) {
    if (hasProjection) {
      renderProjectionSyncStatus(freshnessPopoverEl, prepareProjectionSyncStatus(eventsProjection, EVENTS_NODE));
      freshnessPopoverEl.append(...summaryRows([
        ["Events", `${coverageCountLabel(count, target)} (${percent}%)`],
        ["Updated", updated],
        ["Delta", projectionDeltaStatusLabel(eventsProjection)],
        ["Repair", projectionRepairStatusLabel(eventsProjection, EVENTS_NODE)],
      ]));
    } else {
      freshnessPopoverEl.replaceChildren(...summaryRows([
        ["State", "Awaiting projection"],
        ["Events", ""],
      ]));
    }
  }
  if (!eventsProjection && !events.length) {
    renderEvents();
    renderDashboard();
  }
}

function renderDashboard() {
  if (!dashboardCardsEl || !dashboardShortlistEl || !dashboardCoverageEl || !dashboardStorageEl) return;
  const shellState = deriveRuntimeShellState(runtimeSnapshot, { context: browserStorageShellContext() });
  const storagePostureRows = [
    ["Resource", shellState.resource?.state || "unknown"],
    ["Retention", shellState.retention?.state || "unknown"],
    ["Release", shellState.retention?.releaseRequired ? "blocked" : "ready"],
  ];
  const replayPosture = lastEventTableMaterializationBudget?.replayPosture || null;
  const replayPostureRows = [
    ["Replay", replayPosture ? titleCaseWords(replayPosture.state || "unknown") : "pending"],
    ["Privacy", Array.isArray(replayPosture?.privacy?.tiers) ? replayPosture.privacy.tiers.join(" + ") : ""],
    ["Schema", replayPosture?.schema?.state || "pending"],
  ];
  const hasEventProjection = Boolean(eventsProjection);
  const hasDashboardProjection = Boolean(dashboardProjection);
  const hasAnyProjection = hasEventProjection || hasDashboardProjection || Boolean(healthProjection);
  if (!hasAnyProjection) {
    dashboardCardsEl.replaceChildren(
      metricCard("Critical", "pending", "critical"),
      metricCard("Error", "pending", "error"),
      metricCard("Warn", "pending", "warning"),
      metricCard("Info", "pending", "info"),
    );
    dashboardShortlistEl.replaceChildren(summaryEmpty("Awaiting runtime projection."));
    dashboardCoverageEl.replaceChildren(...summaryRows([
      ["State", "Awaiting projection"],
      ["Materialized", ""],
      ["Coverage", ""],
      ["Window", ""],
    ]));
    dashboardStorageEl.replaceChildren(...summaryRows([
      ["Status", "Awaiting projection"],
      ["Archive", ""],
      ...replayPostureRows,
      ...storagePostureRows,
    ]));
    return;
  }
  const payload = dashboardProjection?.payload || {};
  const eventFabricPosture = serviceEventFabricPosture(payload);
  emitEventFabricPostureDiagnostic(eventFabricPosture);
  const counts = payload.severityCounts || severityCountsFromEvents(events);
  dashboardCardsEl.replaceChildren(
    metricCard("Critical", counts.critical || 0, "critical"),
    metricCard("Error", counts.error || 0, "error"),
    metricCard("Warn", counts.warning || counts.warn || 0, "warning"),
    metricCard("Info", counts.info || counts.notice || 0, "info"),
  );

  const shortlist = Array.isArray(payload.criticalShortlist)
    ? validCriticalShortlist(payload.criticalShortlist)
    : criticalShortlistFromEvents(events);
  dashboardShortlistEl.replaceChildren();
  if (!shortlist.length) {
    dashboardShortlistEl.appendChild(summaryEmpty("No critical, error, or warning events."));
  } else {
    renderDataTable(dashboardShortlistEl, {
      columns: loggingTableColumns(),
      rows: groupContiguousEvents(shortlist),
      emptyLabel: "No critical, error, or warning events.",
      className: "loggingTable loggingDashboardTable",
      getRowClassName: (row) => row.repeatCount > 1 ? "loggingGroupedRow" : "",
      renderExpandedRow: (row) => renderExpandedEventGroup(row),
    });
  }

  renderProjectionSyncStatus(dashboardCoverageEl, prepareProjectionSyncStatus(eventsProjection, EVENTS_NODE));
  dashboardCoverageEl.append(...summaryRows([
    ["State", titleCaseWords(projectionCoverage(eventsProjection).syncState)],
    ["Materialized", coverageCountLabel(
      projectionCoverage(eventsProjection).materializedCount,
      projectionCoverage(eventsProjection).targetCount,
    )],
    ["Coverage", `${Math.round(projectionCoverage(eventsProjection).completionRatio * 100)}%`],
    ["Delta", projectionDeltaStatusLabel(eventsProjection)],
    ["Repair", projectionRepairStatusLabel(eventsProjection, EVENTS_NODE)],
    ["Window", `${projectionPolicy.rollingWindowHours}h rolling`],
  ]));

  const storage = payload.storage || {};
  const health = healthProjection?.payload?.health || {};
  dashboardStorageEl.replaceChildren(...summaryRows([
    ["Status", storage.status || health.storageStatus || health.storage_status || "pending"],
    ["Archive", storage.archiveContainerId || health.archiveContainerId || health.archive_container_id || "not advertised"],
    ...eventFabricSummaryRows(eventFabricPosture),
    ...replayPostureRows,
    ...storagePostureRows,
  ]));
}

function serviceEventFabricPosture(payload = {}) {
  const fabric = payload?.eventFabric;
  if (!fabric || typeof fabric !== "object" || Array.isArray(fabric)) return null;
  const accessGroups = Array.isArray(fabric.accessGroups) ? fabric.accessGroups : [];
  const accessEpochs = Array.isArray(fabric.accessEpochs) ? fabric.accessEpochs : [];
  const accessClasses = Array.isArray(fabric.accessClasses) ? fabric.accessClasses : [];
  const processorContracts = Array.isArray(fabric.processorContracts) ? fabric.processorContracts : [];
  const securityProcessorSeeds = Array.isArray(fabric.securityProcessorSeeds) ? fabric.securityProcessorSeeds : [];
  const processorRoles = Array.isArray(fabric.processorRoles) ? fabric.processorRoles.map((role) => String(role || "").trim()).filter(Boolean) : [];
  const contentClasses = Array.isArray(fabric.contentClasses) ? fabric.contentClasses.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
  const processorStates = processorContracts
    .map((contract) => String(contract?.state || "").trim())
    .filter(Boolean);
  const securitySeedStates = securityProcessorSeeds
    .map((seed) => String(seed?.state || "").trim())
    .filter(Boolean);
  return {
    state: accessGroups.length && accessClasses.length && processorContracts.length && securityProcessorSeeds.length ? "declared" : "pending",
    accessGroupCount: accessGroups.length,
    accessEpochCount: accessEpochs.length,
    accessClassCount: accessClasses.length,
    processorContractCount: processorContracts.length,
    securitySeedCount: securityProcessorSeeds.length,
    processorStates,
    securitySeedStates,
    processorRoles,
    contentClasses,
    currentEpochId: String(fabric.currentEpochId || "").trim(),
  };
}

function eventFabricSummaryRows(posture) {
  if (!posture) return [["Event fabric", "pending"]];
  const processors = posture.processorRoles.length
    ? posture.processorRoles.map((role) => role.replace(/^role:/, "")).join(" + ")
    : "pending";
  return [
    ["Event fabric", titleCaseWords(posture.state || "pending")],
    ["Access", `${posture.accessGroupCount} group / ${posture.accessEpochCount} epoch`],
    ["Classes", posture.contentClasses.length ? posture.contentClasses.join(" + ") : `${posture.accessClassCount} classes`],
    ["Processors", posture.processorContractCount ? `${posture.processorContractCount} contract${posture.processorContractCount === 1 ? "" : "s"}` : processors],
    ["Security", posture.securitySeedCount ? `${posture.securitySeedCount} seed${posture.securitySeedCount === 1 ? "" : "s"}` : "pending"],
  ];
}

function emitEventFabricPostureDiagnostic(posture) {
  const diagnosticKey = JSON.stringify({
    state: posture?.state || "",
    accessGroupCount: posture?.accessGroupCount || 0,
    accessEpochCount: posture?.accessEpochCount || 0,
    accessClassCount: posture?.accessClassCount || 0,
    processorContractCount: posture?.processorContractCount || 0,
    securitySeedCount: posture?.securitySeedCount || 0,
    processorStates: posture?.processorStates || [],
    securitySeedStates: posture?.securitySeedStates || [],
    processorRoles: posture?.processorRoles || [],
    currentEpochId: posture?.currentEpochId || "",
  });
  if (diagnosticKey === lastEventFabricDiagnosticKey) return;
  lastEventFabricDiagnosticKey = diagnosticKey;
  emitDiagnostic("logging-ui.event-fabric.posture", {
    state: posture?.state || "pending",
    accessGroupCount: posture?.accessGroupCount || 0,
    accessEpochCount: posture?.accessEpochCount || 0,
    accessClassCount: posture?.accessClassCount || 0,
    processorContractCount: posture?.processorContractCount || 0,
    securitySeedCount: posture?.securitySeedCount || 0,
    processorStates: posture?.processorStates || [],
    securitySeedStates: posture?.securitySeedStates || [],
    processorRoles: posture?.processorRoles || [],
    currentEpochId: posture?.currentEpochId || "",
  });
}

function renderSettings() {
  if (!settingsSyncEl || !settingsRetentionEl) return;
  renderSettingsTable(settingsSyncEl, "sync");
  renderSettingsTable(settingsRetentionEl, "retain");
}

function renderSettingsTable(host, mode) {
  host.replaceChildren();
  const table = document.createElement("table");
  table.className = "loggingSettingsTableInner";
  table.innerHTML = `
    <thead><tr><th>Class</th><th>${mode === "sync" ? "Client sync" : "Storage retention"}</th></tr></thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  for (const row of SETTINGS_DEFAULTS) {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = row.label;
    const value = document.createElement("td");
    const input = document.createElement("input");
    input.className = "loggingSettingsInput";
    input.value = mode === "sync"
      ? (projectionPolicy.scope?.syncDepth?.[row.key] || row.sync)
      : (projectionPolicy.retentionTarget?.[row.key] || row.retain);
    input.addEventListener("change", () => {
      if (mode === "sync") {
        const syncDepth = {
          ...(projectionPolicy.scope?.syncDepth && typeof projectionPolicy.scope.syncDepth === "object"
            ? projectionPolicy.scope.syncDepth
            : {}),
          [row.key]: input.value.trim() || row.sync,
        };
        saveProjectionPolicy({
          ...projectionPolicy,
          scope: {
            ...projectionPolicy.scope,
            syncDepth,
          },
        });
      } else {
        saveProjectionPolicy({
          ...projectionPolicy,
          retentionTarget: {
            ...projectionPolicy.retentionTarget,
            [row.key]: input.value.trim() || row.retain,
          },
        });
      }
    });
    value.appendChild(input);
    tr.append(label, value);
    body?.appendChild(tr);
  }
  host.appendChild(table);
}

function metricCard(label, value, tone) {
  const card = document.createElement("article");
  card.className = `loggingMetricCard loggingMetricCard-${escapeAttr(tone)}`;
  const title = document.createElement("div");
  title.className = "loggingMetricLabel";
  title.textContent = label;
  const number = document.createElement("div");
  number.className = "loggingMetricValue";
  number.textContent = String(value ?? 0);
  card.append(title, number);
  return card;
}

function summaryRows(rows) {
  return rows.map(([label, value]) => {
    const row = document.createElement("div");
    row.className = "loggingSummaryRow";
    const key = document.createElement("span");
    key.textContent = label;
    const val = document.createElement("strong");
    val.textContent = String(value ?? "");
    row.append(key, val);
    return row;
  });
}

function coverageCountLabel(materializedCount, targetCount) {
  const materialized = Number(materializedCount || 0);
  const target = Number(targetCount || 0);
  if (!target || target <= materialized) {
    return `${materialized} record${materialized === 1 ? "" : "s"}`;
  }
  return `${materialized} / ${target}`;
}

function summaryEmpty(text) {
  const empty = document.createElement("div");
  empty.className = "loggingMuted";
  empty.textContent = text;
  return empty;
}

function severityCountsFromEvents(sourceEvents) {
  const counts = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const event of sourceEvents) {
    const severity = String(event?.severity || "info").toLowerCase();
    if (severity === "critical") counts.critical += 1;
    else if (severity === "error") counts.error += 1;
    else if (severity === "warning" || severity === "warn") counts.warning += 1;
    else counts.info += 1;
  }
  return counts;
}

function criticalShortlistFromEvents(sourceEvents) {
  const shortlist = [];
  for (const event of sourceEvents) {
    const severity = String(event?.severity || "").toLowerCase();
    if (severity !== "critical" && severity !== "error" && severity !== "warning" && severity !== "warn") continue;
    shortlist.push(event);
    if (shortlist.length >= LOGGING_UI_DASHBOARD_SHORTLIST_LIMIT) break;
  }
  lastDashboardShortlistMaterializationBudget = dashboardShortlistMaterializationBudget(sourceEvents, shortlist);
  return shortlist;
}

function validCriticalShortlist(sourceEvents) {
  const shortlist = [];
  for (const event of sourceEvents) {
    if (!isValidEvent(event)) continue;
    shortlist.push(event);
    if (shortlist.length >= LOGGING_UI_DASHBOARD_SHORTLIST_LIMIT) break;
  }
  lastDashboardShortlistMaterializationBudget = dashboardShortlistMaterializationBudget(sourceEvents, shortlist);
  return shortlist;
}

function renderFilterBuilder() {
  const draft = preserveFilterDraft();
  renderActiveFilters();
  restoreFilterDraft(draft);
  renderFilterSuggestions();
  renderEvents();
}

function preserveFilterDraft() {
  if (!filterInputEl) return null;
  return {
    value: filterInputEl.value,
    selectionStart: filterInputEl.selectionStart,
    selectionEnd: filterInputEl.selectionEnd,
    active: document.activeElement === filterInputEl,
  };
}

function restoreFilterDraft(draft) {
  if (!draft || !filterInputEl) return;
  if (filterInputEl.value !== draft.value) filterInputEl.value = draft.value;
  if (!draft.active) return;
  filterInputEl.focus();
  if (draft.selectionStart !== null && draft.selectionEnd !== null) {
    filterInputEl.setSelectionRange(draft.selectionStart, draft.selectionEnd);
  }
}

function renderActiveFilters() {
  if (!activeFiltersEl) return;
  activeFiltersEl.replaceChildren();
  for (const [index, filter] of activeFilters.entries()) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "loggingFilterPill";
    pill.setAttribute("aria-label", `Remove filter ${filterLabel(filter)}`);
    pill.addEventListener("click", () => {
      activeFilters = activeFilters.filter((_, itemIndex) => itemIndex !== index);
      renderFilterBuilder();
    });

    const text = document.createElement("span");
    text.textContent = filterLabel(filter);
    const remove = document.createElement("span");
    remove.className = "loggingFilterPillRemove";
    remove.setAttribute("aria-hidden", "true");
    remove.textContent = "x";
    pill.append(text, remove);
    activeFiltersEl.appendChild(pill);
  }
}

function renderFilterSuggestions() {
  if (!filterSuggestionsEl || !filterInputEl) return;
  if (document.activeElement !== filterInputEl) {
    hideFilterSuggestions();
    return;
  }
  filterSuggestions = buildFilterSuggestions(filterInputEl.value);
  activeSuggestionIndex = clamp(activeSuggestionIndex, 0, Math.max(filterSuggestions.length - 1, 0));
  filterSuggestionsEl.replaceChildren();
  if (!filterSuggestions.length) {
    hideFilterSuggestions();
    return;
  }
  filterSuggestionsEl.classList.remove("hidden");
  for (const [index, suggestion] of filterSuggestions.entries()) {
    const item = document.createElement("button");
    item.type = "button";
    item.id = `filter-suggestion-${index}`;
    item.className = `loggingSuggestion${index === activeSuggestionIndex ? " loggingSuggestion-active" : ""}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", index === activeSuggestionIndex ? "true" : "false");
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applyFilterSuggestion(suggestion);
    });

    const label = document.createElement("span");
    label.className = "loggingSuggestionLabel";
    label.textContent = suggestion.label;
    const hint = document.createElement("span");
    hint.className = "loggingSuggestionHint";
    hint.textContent = suggestion.hint || "";
    item.append(label, hint);
    filterSuggestionsEl.appendChild(item);
  }
}

function hideFilterSuggestions() {
  filterSuggestions = [];
  activeSuggestionIndex = 0;
  filterSuggestionsEl?.classList.add("hidden");
  filterSuggestionsEl?.replaceChildren();
}

function buildFilterSuggestions(text) {
  const draft = parseFilterDraft(text);
  if (!draft.hasKey) return keySuggestions(draft.raw);
  const definition = FILTER_DEFINITION_BY_KEY.get(draft.key);
  if (!definition) return draft.raw ? [{ kind: "raw", value: draft.raw, label: `Search "${draft.raw}"`, hint: "Enter" }] : [];

  const values = suggestionValuesForKey(definition.key);
  const query = definition.range && draft.hasRangeSeparator ? draft.end : draft.start;
  const normalizedQuery = normalizeSuggestionText(query);
  const matches = values
    .filter((value) => normalizeSuggestionText(value).startsWith(normalizedQuery))
    .slice(0, 12)
    .map((value) => ({
      kind: "value",
      key: definition.key,
      value,
      label: value,
      hint: definition.range && !draft.hasRangeSeparator ? "start" : "value",
    }));
  if (!matches.length && query.trim()) {
    matches.push({
      kind: "value",
      key: definition.key,
      value: query.trim(),
      label: query.trim(),
      hint: definition.range && !draft.hasRangeSeparator ? "start" : "force",
    });
  }
  return matches;
}

function keySuggestions(raw) {
  const query = normalizeSuggestionText(raw);
  const matches = FILTER_DEFINITIONS
    .filter((definition) => {
      if (!query) return true;
      return [definition.key, definition.label, ...(definition.aliases || [])]
        .map(normalizeSuggestionText)
        .some((value) => value.startsWith(query));
    })
    .slice(0, 12)
    .map((definition) => ({
      kind: "key",
      key: definition.key,
      label: definition.key,
      hint: definition.range ? "range" : "filter",
    }));
  if (raw.trim()) {
    matches.push({
      kind: "raw",
      value: raw.trim(),
      label: `Search "${raw.trim()}"`,
      hint: "Enter",
    });
  }
  return matches;
}

function onFilterInputKeydown(event) {
  if (!filterInputEl) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!filterSuggestions.length) renderFilterSuggestions();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    activeSuggestionIndex = wrapIndex(activeSuggestionIndex + delta, filterSuggestions.length);
    renderFilterSuggestions();
    return;
  }
  if ((event.key === "Enter" || event.key === "Tab") && filterInputEl.value.trim()) {
    const suggestion = filterSuggestions[activeSuggestionIndex];
    event.preventDefault();
    if (suggestion && (suggestion.kind !== "raw" || event.key === "Enter")) {
      applyFilterSuggestion(suggestion);
    } else {
      commitFilterInput({ forceRaw: event.key === "Enter" });
    }
    return;
  }
  if (event.key === "Backspace") {
    handleFilterBackspace(event);
  }
}

function applyFilterSuggestion(suggestion) {
  if (!filterInputEl || !suggestion) return;
  if (suggestion.kind === "key") {
    filterInputEl.value = `${suggestion.key}: `;
    activeSuggestionIndex = 0;
    renderFilterSuggestions();
    return;
  }
  if (suggestion.kind === "raw") {
    addActiveFilter({ kind: "text", value: suggestion.value });
    return;
  }
  const draft = parseFilterDraft(filterInputEl.value);
  const definition = FILTER_DEFINITION_BY_KEY.get(suggestion.key || draft.key);
  if (!definition) return;
  if (definition.range && !draft.hasRangeSeparator) {
    filterInputEl.value = `${definition.key}: ${suggestion.value}${RANGE_SEPARATOR}`;
    activeSuggestionIndex = 0;
    renderFilterSuggestions();
    return;
  }
  if (definition.range) {
    addActiveFilter({
      kind: "range",
      key: definition.key,
      start: draft.start,
      end: suggestion.value,
    });
    return;
  }
  addActiveFilter({
    kind: "field",
    key: definition.key,
    value: suggestion.value,
  });
}

function commitFilterInput({ forceRaw = false } = {}) {
  if (!filterInputEl) return;
  const text = filterInputEl.value.trim();
  if (!text) return;
  const draft = parseFilterDraft(text);
  if (!draft.hasKey || !FILTER_DEFINITION_BY_KEY.has(draft.key)) {
    if (forceRaw) addActiveFilter({ kind: "text", value: text });
    return;
  }
  const definition = FILTER_DEFINITION_BY_KEY.get(draft.key);
  if (definition.range) {
    if (draft.start && draft.hasRangeSeparator && draft.end) {
      addActiveFilter({ kind: "range", key: definition.key, start: draft.start, end: draft.end });
      return;
    }
    if (draft.start && !draft.hasRangeSeparator) {
      filterInputEl.value = `${definition.key}: ${draft.start}${RANGE_SEPARATOR}`;
      renderFilterSuggestions();
    }
    return;
  }
  if (draft.start) addActiveFilter({ kind: "field", key: definition.key, value: draft.start });
}

function handleFilterBackspace(event) {
  if (!filterInputEl) return;
  const value = filterInputEl.value;
  if (value === "" && activeFilters.length) {
    event.preventDefault();
    const last = activeFilters[activeFilters.length - 1];
    activeFilters = activeFilters.slice(0, -1);
    filterInputEl.value = filterText(last);
    renderFilterBuilder();
    return;
  }
  if (value.endsWith(RANGE_SEPARATOR)) {
    event.preventDefault();
    filterInputEl.value = value.slice(0, -RANGE_SEPARATOR.length);
    renderFilterSuggestions();
    return;
  }
  if (/:\s$/.test(value)) {
    event.preventDefault();
    filterInputEl.value = value.replace(/:\s$/, "");
    renderFilterSuggestions();
  }
}

function addActiveFilter(filter) {
  if (!filterInputEl) return;
  const normalized = normalizeFilter(filter);
  if (!normalized) return;
  const signature = stableStringify(normalized);
  if (!activeFilters.some((entry) => stableStringify(entry) === signature)) {
    activeFilters = [...activeFilters, normalized];
  }
  filterInputEl.value = "";
  hideFilterSuggestions();
  renderFilterBuilder();
}

function normalizeFilter(filter) {
  if (!filter || typeof filter !== "object") return null;
  if (filter.kind === "text") {
    const value = String(filter.value || "").trim();
    return value ? { kind: "text", value } : null;
  }
  const key = resolveFilterKey(filter.key);
  if (!key) return null;
  const definition = FILTER_DEFINITION_BY_KEY.get(key);
  if (filter.kind === "range" && definition?.range) {
    const start = String(filter.start || "").trim();
    const end = String(filter.end || "").trim();
    return start && end ? { kind: "range", key, start, end } : null;
  }
  const value = String(filter.value || "").trim();
  return value ? { kind: "field", key, value } : null;
}

function filterLabel(filter) {
  if (filter.kind === "text") return filter.value;
  if (filter.kind === "range") return `${filter.key}: ${filter.start}${RANGE_SEPARATOR}${filter.end}`;
  return `${filter.key}: ${filter.value}`;
}

function filterText(filter) {
  return filterLabel(filter);
}

function parseFilterDraft(text) {
  const raw = String(text || "");
  const colonIndex = raw.indexOf(":");
  if (colonIndex < 0) {
    return { raw, hasKey: false, key: resolveFilterKey(raw), start: "", end: "", hasRangeSeparator: false };
  }
  const key = resolveFilterKey(raw.slice(0, colonIndex));
  const valueText = raw.slice(colonIndex + 1).trimStart();
  const separatorIndex = valueText.indexOf(RANGE_SEPARATOR);
  return {
    raw,
    hasKey: true,
    key,
    start: separatorIndex >= 0 ? valueText.slice(0, separatorIndex).trim() : valueText.trim(),
    end: separatorIndex >= 0 ? valueText.slice(separatorIndex + RANGE_SEPARATOR.length).trim() : "",
    hasRangeSeparator: separatorIndex >= 0,
  };
}

function resolveFilterKey(value) {
  const normalized = normalizeSuggestionText(value);
  if (!normalized) return "";
  const exact = FILTER_DEFINITIONS.find((definition) => {
    return [definition.key, definition.label, ...(definition.aliases || [])]
      .map(normalizeSuggestionText)
      .includes(normalized);
  });
  if (exact) return exact.key;
  const prefixMatches = FILTER_DEFINITIONS.filter((definition) => {
    return [definition.key, definition.label, ...(definition.aliases || [])]
      .map(normalizeSuggestionText)
      .some((candidate) => candidate.startsWith(normalized));
  });
  return prefixMatches.length === 1 ? prefixMatches[0].key : "";
}

function suggestionValuesForKey(key) {
  switch (key) {
    case "severity":
      return [...LOGGING_SEVERITIES];
    case "category":
      return uniqueValues([...LOGGING_CATEGORIES, ...events.map((event) => event.category)]);
    case "outcome":
      return [...LOGGING_OUTCOMES];
    case "verbosity":
      return [...LOGGING_VERBOSITIES];
    case "source":
      return uniqueValues(events.flatMap((event) => [
        sourceLabel(event),
        event?.producer?.service,
        event?.producer?.component,
      ]));
    case "subject":
      return uniqueValues(events.map((event) => subjectLabel(event)));
    case "tag":
      return uniqueValues(events.flatMap((event) => displayTags(event)));
    case "fact":
      return uniqueValues(events.flatMap((event) => Object.entries(event?.safeFacts || event?.safe_facts || {})
        .flatMap(([factKey, factValue]) => [factKey, `${factKey}: ${formatFactValue(factValue)}`])));
    case "resource":
      return uniqueValues(events.flatMap((event) => resourceValues(event)));
    case "correlation":
      return uniqueValues(events.flatMap((event) => correlationValues(event)));
    case "time":
      return uniqueValues(events.slice(0, 24).map((event) => filterTimeLabel(eventTimeSeconds(event))));
    default:
      return [];
  }
}
function renderEvents() {
  eventListEl.replaceChildren();
  const filtered = filteredEvents();
  const grouped = groupContiguousEvents(filtered);
  if (!filtered.length) {
    renderDataTable(eventListEl, {
      columns: loggingTableColumns(),
      rows: [],
      emptyLabel: events.length ? "No events match the current filters." : "Waiting for events.",
      className: "loggingTable",
    });
    return;
  }
  renderDataTable(eventListEl, {
    columns: loggingTableColumns(),
    rows: grouped,
    emptyLabel: "No events match the current filters.",
    className: "loggingTable",
    getRowClassName: (row) => row.repeatCount > 1 ? "loggingGroupedRow" : "",
    renderExpandedRow: (row) => renderExpandedEventGroup(row),
  });
}

function loggingTableColumns({ subtable = false } = {}) {
  return [
    {
      id: "time",
      header: "Time",
      className: "loggingTimeCell",
      render: (row) => timeCellNode(row, { subtable }),
    },
    {
      id: "severity",
      header: "Level",
      className: "loggingLevelCell",
      render: (row) => severityPill(eventForRow(row).severity || "info"),
    },
    {
      id: "category",
      header: "Category",
      render: (row) => eventForRow(row).category || "",
    },
    {
      id: "outcome",
      header: "Outcome",
      render: (row) => eventForRow(row).outcome || "",
    },
    {
      id: "source",
      header: "Source",
      render: (row) => sourceLabel(eventForRow(row)),
    },
    {
      id: "subject",
      header: "Subject",
      className: "loggingSubjectCell",
      render: (row) => subjectLabel(eventForRow(row)),
    },
    {
      id: "tags",
      header: "Tags",
      className: "loggingTagsCell",
      render: (row) => tagPillsNode(eventForRow(row)),
    },
    {
      id: "otherFacts",
      header: "Other Facts",
      className: "loggingFactsCell",
      render: (row) => safeFactPillsNode(eventForRow(row)),
    },
    {
      id: "details",
      header: "Details",
      className: "loggingDetailsCell",
      render: (row) => detailsActionNode(eventForRow(row)),
    },
  ];
}

function projectionSelectionMaterializationBudget(nodePath, examinedCount, matchedCount, sampledAt = Date.now()) {
  const maxProjectionCandidates = materializationBudgetLimit(
    LOGGING_UI_PROJECTION_SELECTION_CONTRACT_BUDGET,
    "maxProjectionCount",
    Object.keys(RUNTIME_PROJECTION_CHANNELS).length * 4,
  );
  return assertMaterializationBudget(materializationBudgetRecord(LOGGING_UI_PROJECTION_SELECTION_CONTRACT_BUDGET, {
    budgetId: `${LOGGING_UI_PROJECTION_SELECTION_MATERIALIZATION_BUDGET_ID}:${String(nodePath || "unknown").trim() || "unknown"}`,
    sourceCount: examinedCount,
    materializedCount: matchedCount,
    sourceLimitKey: "maxProjectionCount",
    materializedLimitKey: "maxProjectionCount",
    blockedReason: "loggingUiProjectionSelectionPressure",
    limits: {
      maxProjectionCandidates,
      examinedCount,
      matchedCount,
      nodePath,
    },
    snapshotPolicy: { mode: "single-pass-node-selection" },
    deltaPolicy: { mode: "replace-selected-reference" },
    coalescing: { key: "projectionRuntimeKey" },
    cardinality: { maxNodePaths: Object.keys(RUNTIME_PROJECTION_CHANNELS).length },
    schema: {
      state: SWARM.MATERIALIZATION_SCHEMA_STATE.CURRENT,
      version: "logging-ui.projection-selection.v1",
    },
    referenceRefs: ["runtime.projection.snapshot"],
    retentionClass: "ephemeral.ui-index",
    sampledAt,
  }));
}

function dashboardShortlistMaterializationBudget(sourceEvents, materializedEvents, sampledAt = Date.now()) {
  return assertMaterializationBudget(materializationBudgetRecord(LOGGING_UI_DASHBOARD_SHORTLIST_CONTRACT_BUDGET, {
    sourceCount: sourceEvents.length,
    materializedCount: materializedEvents.length,
    sourceLimitKey: "maxItems",
    materializedLimitKey: "maxRenderedItems",
    blockedReason: "loggingUiDashboardShortlistPressure",
    limits: {
      maxRenderedEvents: LOGGING_UI_DASHBOARD_SHORTLIST_LIMIT,
      sourceCount: sourceEvents.length,
      materializedCount: materializedEvents.length,
    },
    snapshotPolicy: { mode: "runtime-dashboard-or-local-reference" },
    deltaPolicy: { mode: "bounded-severity-shortlist" },
    coalescing: { key: "eventMaterializationKey" },
    cardinality: { maxSeverityBands: 4 },
    schema: {
      state: SWARM.MATERIALIZATION_SCHEMA_STATE.CURRENT,
      version: "logging-ui.dashboard-shortlist.v1",
    },
    referenceRefs: ["logging-ui.dashboard"],
    retentionClass: "ephemeral.ui-projection",
    sampledAt,
  }));
}

function eventTableReplayPosture(sourceEvents, materializedEvents, sampledAt = Date.now()) {
  const localPosture = materializationEventReplayPosture(LOGGING_UI_EVENT_TABLE_CONTRACT_BUDGET, {
    sourceEvents,
    materializedEvents,
    eventKey: eventMaterializationKey,
    eventTime: eventEventTimeMillis,
    observedTime: eventObservedTimeMillis,
    schemaVersion: eventSchemaVersion,
    safeFacts: (event) => event?.safeFacts || event?.safe_facts || {},
    tags: (event) => Array.isArray(event?.tags) ? event.tags : [],
    encryptedDetailRefs,
    expectedSchemaVersion: LOGGING.SCHEMA_VERSION,
    sampledAt,
    consumerFloor: {
      floorId: `floor:${LOGGING_UI_EVENT_TABLE_MATERIALIZATION_BUDGET_ID}`,
      consumerRef: "logging-ui.events-view",
      materializationId: LOGGING_UI_EVENT_TABLE_MATERIALIZATION_BUDGET_ID,
      subjectRef: "logging.events.ui-table",
    },
  });
  const servicePosture = serviceProjectionReplayPosture(eventsProjection);
  if (!servicePosture) return localPosture;
  return {
    ...localPosture,
    upstreamPosture: servicePosture,
    upstreamState: servicePosture.state || "unknown",
    upstreamConsumerFloor: servicePosture.consumerFloor || null,
    upstreamPrivacy: servicePosture.privacy || null,
  };
}

function serviceProjectionReplayPosture(projection = eventsProjection) {
  const posture = projection?.payload?.replayPosture || projection?.replayPosture || null;
  return posture && typeof posture === "object" && !Array.isArray(posture) ? posture : null;
}

function serviceProjectionMaterializationBudget(projection = eventsProjection) {
  const budget = projection?.payload?.materializationBudget || projection?.materializationBudget || null;
  return budget && typeof budget === "object" && !Array.isArray(budget) ? budget : null;
}

function eventTableConsumerFloor(sourceEvents, materializedEvents, sampledAt = Date.now(), replayPosture = null) {
  const posture = replayPosture || eventTableReplayPosture(sourceEvents, materializedEvents, sampledAt);
  return assertConsumerFloor({
    ...materializationConsumerFloorRecord(LOGGING_UI_EVENT_TABLE_CONTRACT_BUDGET, {
    floorId: `floor:${LOGGING_UI_EVENT_TABLE_MATERIALIZATION_BUDGET_ID}`,
    consumerRef: "logging-ui.events-view",
    materializationId: LOGGING_UI_EVENT_TABLE_MATERIALIZATION_BUDGET_ID,
    subjectRef: "logging.events.ui-table",
    sourceCount: sourceEvents.length,
    materializedCount: materializedEvents.length,
      cursor: posture.consumerFloor?.cursor,
      eventTimeFloor: posture.bitemporal?.eventTimeFloor,
      observedTimeFloor: posture.bitemporal?.observedTimeFloor || sampledAt,
    reason: sourceEvents.length > LOGGING_UI_EVENT_TABLE_EVENT_LIMIT
      ? "logging UI event table source count exceeds local materialization budget"
        : (posture.blockedReasons?.[0] || ""),
      replay: posture.consumerFloor?.replay || { mode: "ui-filter", sourceCount: sourceEvents.length },
      redelivery: posture.consumerFloor?.redelivery || { mode: "rerender", duplicatePolicy: "eventMaterializationKey" },
      sampledAt,
    }),
    lagState: posture.consumerFloor?.lagState || "unknown",
  });
}

function eventTableMaterializationBudget(sourceEvents, materializedEvents, sampledAt = Date.now()) {
  const replayPosture = eventTableReplayPosture(sourceEvents, materializedEvents, sampledAt);
  return assertMaterializationBudget(materializationBudgetRecord(LOGGING_UI_EVENT_TABLE_CONTRACT_BUDGET, {
    sourceCount: sourceEvents.length,
    materializedCount: materializedEvents.length,
    sourceLimitKey: "maxSourceItems",
    materializedLimitKey: "maxItems",
    blockedReason: "loggingUiEventTablePressure",
    limits: {
      maxSourceEvents: LOGGING_UI_EVENT_TABLE_EVENT_LIMIT,
      maxRenderedEvents: LOGGING_UI_EVENT_TABLE_EVENT_LIMIT,
      activeFilterCount: activeFilters.length,
      sourceCount: sourceEvents.length,
      materializedCount: materializedEvents.length,
    },
    snapshotPolicy: { mode: "runtime-projection-owned" },
    deltaPolicy: { mode: "ui-filter-reference-view" },
    coalescing: { key: "eventMaterializationKey" },
    cardinality: {
      maxFilterCount: FILTER_DEFINITIONS.length,
      maxVisibleTagValues: 24,
      safeFactKeyCount: replayPosture.cardinality?.safeFactKeyCount || 0,
      labelValueCount: replayPosture.cardinality?.labelValueCount || 0,
      highCardinalityOverflow: "encryptedDetailRef",
    },
    schema: {
      state: replayPosture.schema?.state === "quarantined"
        ? SWARM.MATERIALIZATION_SCHEMA_STATE.QUARANTINED
        : SWARM.MATERIALIZATION_SCHEMA_STATE.CURRENT,
      version: "logging-ui.event-table.v1",
      eventSchemaVersions: replayPosture.schema?.versions || {},
    },
    consumerFloor: eventTableConsumerFloor(sourceEvents, materializedEvents, sampledAt, replayPosture),
    replayPosture,
    referenceRefs: ["logging-ui.events"],
    retentionClass: "ephemeral.ui-projection",
    sampledAt,
  }));
}

function eventEventTimeMillis(event) {
  return timestampMillis(eventTimeSeconds(event));
}

function eventObservedTimeMillis(event) {
  const observed = Number(event?.observedAt || event?.observed_at || 0);
  return observed ? timestampMillis(observed) : eventEventTimeMillis(event);
}

function eventSchemaVersion(event) {
  return event?.schemaVersion || event?.schema_version || LOGGING.SCHEMA_VERSION;
}

function materializeFilteredEvents() {
  const materialized = [];
  for (const event of events) {
    let accepted = true;
    for (const filter of activeFilters) {
      if (!eventMatchesFilter(event, filter)) {
        accepted = false;
        break;
      }
    }
    if (accepted) materialized.push(event);
  }
  lastEventTableMaterializationBudget = eventTableMaterializationBudget(events, materialized);
  const serviceReplayPosture = serviceProjectionReplayPosture(eventsProjection);
  const serviceMaterializationBudget = serviceProjectionMaterializationBudget(eventsProjection);
  const diagnosticKey = JSON.stringify({
    budgetId: lastEventTableMaterializationBudget.budgetId,
    serviceBudgetId: serviceMaterializationBudget?.budgetId || "",
    sourceCount: events.length,
    materializedCount: materialized.length,
    activeFilterCount: activeFilters.length,
    state: lastEventTableMaterializationBudget.state,
    replayState: lastEventTableMaterializationBudget.replayPosture?.state || "",
    serviceReplayState: serviceReplayPosture?.state || "",
    schemaState: lastEventTableMaterializationBudget.replayPosture?.schema?.state || "",
  });
  if (diagnosticKey !== lastEventTableMaterializationDiagnosticKey) {
    lastEventTableMaterializationDiagnosticKey = diagnosticKey;
    emitDiagnostic("logging-ui.event-table.materialized", {
      sourceCount: events.length,
      materializedCount: materialized.length,
      activeFilterCount: activeFilters.length,
      materializationBudget: {
        budgetId: lastEventTableMaterializationBudget.budgetId,
        payloadClass: lastEventTableMaterializationBudget.payloadClass,
        copyRole: lastEventTableMaterializationBudget.copyRole,
        transferMode: lastEventTableMaterializationBudget.transferMode,
        state: lastEventTableMaterializationBudget.state,
      },
      serviceMaterializationBudget: serviceMaterializationBudget ? {
        budgetId: serviceMaterializationBudget.budgetId || "",
        payloadClass: serviceMaterializationBudget.payloadClass || "",
        copyRole: serviceMaterializationBudget.copyRole || "",
        transferMode: serviceMaterializationBudget.transferMode || "",
        state: serviceMaterializationBudget.state || "",
      } : null,
      consumerFloor: {
        floorId: lastEventTableMaterializationBudget.consumerFloor?.floorId || "",
        lagState: lastEventTableMaterializationBudget.consumerFloor?.lagState || "",
        eventTimeFloor: lastEventTableMaterializationBudget.consumerFloor?.eventTimeFloor || "",
        observedTimeFloor: lastEventTableMaterializationBudget.consumerFloor?.observedTimeFloor || "",
      },
      replayPosture: {
        state: lastEventTableMaterializationBudget.replayPosture?.state || "",
        schemaState: lastEventTableMaterializationBudget.replayPosture?.schema?.state || "",
        privacyTiers: lastEventTableMaterializationBudget.replayPosture?.privacy?.tiers || [],
        cardinalityState: lastEventTableMaterializationBudget.replayPosture?.cardinality?.state || "",
        samplingState: lastEventTableMaterializationBudget.replayPosture?.sampling?.state || "",
      },
      serviceReplayPosture: serviceReplayPosture ? {
        state: serviceReplayPosture.state || "",
        schemaState: serviceReplayPosture.schema?.state || "",
        privacyTiers: serviceReplayPosture.privacy?.tiers || [],
        cardinalityState: serviceReplayPosture.cardinality?.state || "",
        samplingState: serviceReplayPosture.sampling?.state || "",
      } : null,
    });
  }
  return materialized;
}

function filteredEvents() {
  return materializeFilteredEvents();
}

function eventMatchesFilter(event, filter) {
  if (!filter) return true;
  if (filter.kind === "text") return eventSearchText(event).includes(String(filter.value || "").trim().toLowerCase());
  if (filter.kind === "range") return eventMatchesRangeFilter(event, filter);
  return eventMatchesFieldFilter(event, filter);
}

function eventMatchesFieldFilter(event, filter) {
  const needle = normalizeSuggestionText(filter.value);
  if (!needle) return true;
  switch (filter.key) {
    case "severity":
      return normalizeSuggestionText(event.severity) === needle;
    case "category":
      return normalizeSuggestionText(event.category) === needle;
    case "outcome":
      return normalizeSuggestionText(event.outcome) === needle;
    case "verbosity":
      return normalizeSuggestionText((event?.safeFacts || event?.safe_facts || {}).verbosityClass) === needle;
    case "source":
      return valueSetMatches(sourceValues(event), needle);
    case "subject":
      return valueSetMatches([subjectLabel(event), event?.subject?.id, event?.subject?.display], needle);
    case "tag":
      return valueSetMatches(displayTags(event), needle);
    case "fact":
      return eventSafeFactText(event).includes(needle);
    case "resource":
      return valueSetMatches(resourceValues(event), needle);
    case "correlation":
      return valueSetMatches(correlationValues(event), needle);
    case "time":
      return filterTimeLabel(eventTimeSeconds(event)).toLowerCase().includes(String(filter.value || "").trim().toLowerCase());
    default:
      return eventSearchText(event).includes(needle);
  }
}

function eventMatchesRangeFilter(event, filter) {
  if (filter.key === "severity") {
    const current = severityRank(event.severity);
    const start = severityRank(filter.start);
    const end = severityRank(filter.end);
    if (current < 0 || start < 0 || end < 0) return false;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    return current >= low && current <= high;
  }
  if (filter.key === "time") {
    const current = timestampMillis(eventTimeSeconds(event));
    const start = parseFilterTime(filter.start, { endOfDay: false });
    const end = parseFilterTime(filter.end, { endOfDay: true });
    if (!current || !start || !end) return false;
    return current >= Math.min(start, end) && current <= Math.max(start, end);
  }
  return eventMatchesFieldFilter(event, { kind: "field", key: filter.key, value: filter.start })
    || eventMatchesFieldFilter(event, { kind: "field", key: filter.key, value: filter.end });
}

function valueSetMatches(values, normalizedNeedle) {
  return values
    .map((value) => normalizeSuggestionText(value))
    .filter(Boolean)
    .some((value) => value === normalizedNeedle || value.includes(normalizedNeedle));
}

function sourceValues(event) {
  return [
    sourceLabel(event),
    event?.producer?.service,
    event?.producer?.component,
  ];
}

function resourceValues(event) {
  const resource = event?.resource && typeof event.resource === "object" ? event.resource : null;
  return [
    resource?.display,
    resource?.id,
    resource?.kind,
  ];
}

function correlationValues(event) {
  const correlation = event?.correlation && typeof event.correlation === "object" ? event.correlation : null;
  return [
    correlation?.id,
    correlation?.traceId,
    correlation?.trace_id,
    correlation?.requestId,
    correlation?.request_id,
    correlation?.group,
  ];
}

function eventSafeFactText(event) {
  const facts = event?.safeFacts || event?.safe_facts || {};
  return JSON.stringify(facts || {}).toLowerCase();
}

function severityRank(value) {
  const key = normalizeSuggestionText(value);
  return SEVERITY_RANK.has(key) ? SEVERITY_RANK.get(key) : -1;
}

function parseFilterTime(value, { endOfDay = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi, (_, hour, minutes = "00", meridiem) => `${hour}:${minutes} ${meridiem.toUpperCase()}`)
    .replace(/,\s*/g, " ");
  let millis = Date.parse(normalized);
  if (!Number.isFinite(millis) && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    millis = Date.parse(`${raw} ${endOfDay ? "23:59:59" : "00:00:00"}`);
  }
  return Number.isFinite(millis) ? millis : 0;
}
function groupContiguousEvents(sourceEvents) {
  const sorted = [...sourceEvents].sort((left, right) => eventTimeSeconds(right) - eventTimeSeconds(left));
  const groups = [];
  for (const event of sorted) {
    const signature = eventGroupSignature(event);
    const timestamp = eventTimeSeconds(event);
    const previous = groups[groups.length - 1];
    if (
      previous
      && previous.signature === signature
      && Math.abs(previous.lastTimestamp - timestamp) <= 60
    ) {
      previous.events.push(event);
      previous.lastTimestamp = timestamp;
      previous.oldestTimestamp = Math.min(previous.oldestTimestamp, timestamp);
      previous.groupId = eventGroupId(previous.signature, previous.newestTimestamp, previous.oldestTimestamp);
      continue;
    }
    groups.push({
      kind: "eventGroup",
      signature,
      groupId: eventGroupId(signature, timestamp, timestamp),
      event,
      events: [event],
      repeatCount: 1,
      newestTimestamp: timestamp,
      oldestTimestamp: timestamp,
      lastTimestamp: timestamp,
    });
  }
  for (const group of groups) {
    group.repeatCount = group.events.length;
    group.event = group.events[0];
  }
  for (const groupId of Array.from(expandedEventGroups)) {
    if (!groups.some((group) => group.groupId === groupId && group.repeatCount > 1)) {
      expandedEventGroups.delete(groupId);
    }
  }
  return groups;
}

function eventForRow(row) {
  return row?.kind === "eventGroup" ? row.event : row;
}

function timeCellNode(row, { subtable = false } = {}) {
  const event = eventForRow(row);
  const wrap = document.createElement("div");
  wrap.className = "loggingTimeCellWrap";
  const time = document.createElement("span");
  time.textContent = shortEventTime(event.occurredAt || event.occurred_at);
  wrap.appendChild(time);
  if (!subtable && row?.repeatCount > 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "loggingRepeatToggle";
    button.setAttribute("aria-expanded", expandedEventGroups.has(row.groupId) ? "true" : "false");
    button.setAttribute("aria-label", `${expandedEventGroups.has(row.groupId) ? "Collapse" : "Expand"} ${row.repeatCount} matching events`);
    button.addEventListener("click", () => {
      if (expandedEventGroups.has(row.groupId)) expandedEventGroups.delete(row.groupId);
      else expandedEventGroups.add(row.groupId);
      renderEvents();
    });
    const chevron = document.createElement("span");
    chevron.className = "loggingRepeatChevron";
    chevron.setAttribute("aria-hidden", "true");
    const count = document.createElement("span");
    count.className = "loggingRepeatCount";
    count.textContent = `x${row.repeatCount}`;
    button.append(chevron, count);
    wrap.appendChild(button);
  }
  return wrap;
}

function renderExpandedEventGroup(row) {
  if (!row || row.repeatCount <= 1 || !expandedEventGroups.has(row.groupId)) return null;
  const wrap = document.createElement("div");
  wrap.className = "loggingRepeatPanel";
  const summary = document.createElement("div");
  summary.className = "loggingRepeatSummary";
  summary.textContent = `${row.repeatCount} matching entries; each adjacent event is within 60 seconds of the previous match.`;
  const tableHost = document.createElement("div");
  tableHost.className = "loggingRepeatTableHost";
  renderDataTable(tableHost, {
    columns: loggingTableColumns({ subtable: true }),
    rows: row.events,
    emptyLabel: "No repeated entries",
    className: "loggingRepeatTable",
  });
  wrap.append(summary, tableHost);
  return wrap;
}

function eventGroupSignature(event) {
  return stableStringify({
    severity: event?.severity,
    category: event?.category,
    outcome: event?.outcome,
    source: sourceLabel(event),
    subject: subjectLabel(event),
    tags: displayTags(event),
    facts: nonColumnSafeFacts(event).map(([key, value]) => [key, stableComparableValue(value)]),
    details: encryptedDetailRefs(event).map((ref) => stableComparableValue(detailRefRows(ref))),
  });
}

function eventGroupId(signature, newestTimestamp, oldestTimestamp) {
  return `event-group-${hashString(signature)}-${newestTimestamp}-${oldestTimestamp}`;
}

function eventTimeSeconds(event) {
  return Number(event?.occurredAt || event?.occurred_at || 0);
}

function timestampMillis(value) {
  const raw = Number(value || 0);
  if (!raw) return 0;
  return raw > 9_999_999_999 ? raw : raw * 1000;
}

function severityPill(value) {
  const severity = String(value || "info").trim().toLowerCase() || "info";
  const pill = document.createElement("span");
  pill.className = `loggingPill loggingPill-${escapeAttr(severity)}`;
  pill.textContent = severity;
  return pill;
}

function sourceLabel(event) {
  return [
    event?.producer?.service,
    event?.producer?.component,
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" / ") || "unknown";
}

function subjectLabel(event) {
  const subject = event?.subject && typeof event.subject === "object" ? event.subject : null;
  const resource = event?.resource && typeof event.resource === "object" ? event.resource : null;
  return subject?.display
    || subject?.id
    || resource?.display
    || resource?.id
    || "event";
}

function tagPillsNode(event) {
  const wrap = document.createElement("div");
  wrap.className = "loggingPillWrap loggingTagPills";
  const tags = displayTags(event);
  for (const tag of tags.slice(0, 4)) {
    const text = String(tag || "").trim();
    if (text) wrap.appendChild(compactPill(`#${text}`, "loggingTagPill"));
  }
  if (tags.length > 4) wrap.appendChild(compactPill(`+${tags.length - 4}`, "loggingMorePill"));
  return wrap;
}

function safeFactPillsNode(event) {
  const wrap = document.createElement("div");
  wrap.className = "loggingPillWrap loggingFactPills";
  const facts = nonColumnSafeFacts(event);
  for (const [key, value] of facts.slice(0, 4)) {
    wrap.appendChild(compactPill(`${key}: ${formatFactValue(value)}`, "loggingFactPill"));
  }
  if (facts.length > 4) wrap.appendChild(compactPill(`+${facts.length - 4}`, "loggingMorePill"));
  return wrap;
}

function detailsActionNode(event) {
  const refs = encryptedDetailRefs(event);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "loggingDetailButton";
  button.textContent = refs.length ? "Details" : "No detail";
  button.disabled = refs.length === 0;
  if (refs.length) {
    button.title = "Open encrypted detail references";
    button.addEventListener("click", () => openDetailModal(event));
  }
  return button;
}

function compactPill(text, className) {
  const pill = document.createElement("span");
  pill.className = `loggingCompactPill ${className}`;
  pill.textContent = String(text || "").trim();
  return pill;
}

function nonColumnSafeFacts(event) {
  const facts = event?.safeFacts || event?.safe_facts || {};
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return [];
  const visibleValues = visibleColumnValues(event);
  return Object.entries(facts)
    .filter(([key, value]) => value !== null && value !== undefined && value !== "" && !String(key || "").startsWith("_"))
    .filter(([key, value]) => !isColumnSafeFactKey(key) && !overlapsComparableKeys(formatFactValue(value), visibleValues));
}

function visibleColumnValues(event) {
  const values = [
    event?.severity,
    event?.category,
    event?.outcome,
    sourceLabel(event),
    subjectLabel(event),
    event?.producer?.service,
    event?.producer?.component,
    ...displayTags(event),
  ];
  const keys = new Set();
  for (const value of values) {
    for (const key of comparableKeys(value)) keys.add(key);
  }
  return keys;
}

function displayTags(event) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  const duplicateKeys = tagDuplicateKeys(event);
  return tags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .filter((tag) => !overlapsComparableKeys(tag, duplicateKeys));
}

function tagDuplicateKeys(event) {
  const values = [
    event?.severity,
    event?.category,
    event?.outcome,
    sourceLabel(event),
    subjectLabel(event),
    event?.producer?.service,
    event?.producer?.component,
  ];
  const keys = new Set();
  for (const value of values) {
    for (const key of comparableKeys(value)) keys.add(key);
  }
  return keys;
}

function overlapsComparableKeys(value, keys) {
  for (const key of comparableKeys(value)) {
    if (keys.has(key)) return true;
  }
  return false;
}

function isColumnSafeFactKey(key) {
  const normalized = String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return COLUMN_SAFE_FACT_KEYS.has(normalized);
}

function comparableKeys(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const expanded = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_/.-]+/g, " ")
    .toLowerCase();
  const compactRaw = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const compactExpanded = expanded.replace(/[^a-z0-9]/g, "");
  const tokens = expanded.split(/\s+/).map((part) => part.trim()).filter(Boolean);
  return Array.from(new Set([
    raw.toLowerCase(),
    compactRaw,
    compactExpanded,
    ...tokens,
  ].filter(Boolean)));
}

function encryptedDetailRefs(event) {
  const refs = [];
  for (const value of [
    event?.detailRef,
    event?.detail_ref,
    event?.encryptedDetailRef,
    event?.encrypted_detail_ref,
  ]) {
    if (value) refs.push(value);
  }
  for (const value of [
    event?.encryptedDetailRefs,
    event?.encrypted_detail_refs,
    event?.detailRefs,
    event?.detail_refs,
  ]) {
    if (Array.isArray(value)) refs.push(...value.filter(Boolean));
  }
  return refs;
}

function openDetailModal(event) {
  const refs = encryptedDetailRefs(event);
  if (!detailModalEl || !detailModalBackdropEl || !detailModalBodyEl) return;
  detailModalSubtitleEl.textContent = subjectLabel(event);
  detailModalBodyEl.replaceChildren();

  const status = document.createElement("p");
  status.className = "loggingModalCopy";
  status.textContent = refs.length
    ? "Encrypted detail is attached. Decrypt/view remains client-side through account/runtime; Logging does not hold plaintext."
    : "No encrypted detail is attached to this event.";
  detailModalBodyEl.appendChild(status);

  if (refs.length) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "loggingDecryptButton";
    action.disabled = true;
    action.textContent = "Decrypt / view";
    action.title = "Client-side decrypt is not wired in this UI yet.";
    detailModalBodyEl.appendChild(action);

    const list = document.createElement("div");
    list.className = "loggingDetailRefList";
    refs.forEach((ref, index) => list.appendChild(detailRefNode(ref, index)));
    detailModalBodyEl.appendChild(list);
  }

  detailModalBackdropEl.classList.remove("hidden");
  detailModalEl.classList.remove("hidden");
  detailModalCloseEl?.focus();
}

function closeDetailModal() {
  detailModalBackdropEl?.classList.add("hidden");
  detailModalEl?.classList.add("hidden");
  detailModalBodyEl?.replaceChildren();
}

function detailRefNode(ref, index) {
  const item = document.createElement("article");
  item.className = "loggingDetailRef";

  const title = document.createElement("div");
  title.className = "loggingDetailRefTitle";
  title.textContent = `Detail ref ${index + 1}`;
  item.appendChild(title);

  for (const [label, value] of detailRefRows(ref)) {
    const row = document.createElement("div");
    row.className = "loggingDetailRefRow";
    const keyEl = document.createElement("span");
    keyEl.textContent = label;
    const valueEl = document.createElement("code");
    valueEl.textContent = formatFactValue(value);
    row.append(keyEl, valueEl);
    item.appendChild(row);
  }
  return item;
}

function detailRefRows(ref) {
  if (!ref || typeof ref !== "object") return [["ref", String(ref ?? "")]];
  return [
    ["container", ref.containerId || ref.container_id],
    ["object", ref.objectId || ref.object_id],
    ["key", ref.keyRef || ref.key_ref],
    ["manifest", ref.manifestHash || ref.manifest_hash],
    ["tags", Array.isArray(ref.summaryTags || ref.summary_tags) ? (ref.summaryTags || ref.summary_tags).join(", ") : ""],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function formatFactValue(value) {
  if (typeof value === "string") return value.length > 42 ? `${value.slice(0, 39)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const encoded = JSON.stringify(value);
    return encoded.length > 42 ? `${encoded.slice(0, 39)}...` : encoded;
  } catch {
    return String(value);
  }
}

function stableComparableValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => stableComparableValue(item));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      result[key] = stableComparableValue(value[key]);
    }
    return result;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableComparableValue(value));
}

function hashString(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function addNotification(tone, title, body) {
  notifications.unshift({
    id: randomOpaqueId("notif"),
    tone: String(tone || "neutral"),
    title: String(title || "").trim(),
    body: String(body || "").trim(),
    ts: Date.now(),
    read: false,
  });
  while (notifications.length > 16) notifications.pop();
  renderNotifications();
}

function renderNotifications() {
  if (!notifListEl || !btnBellEl) return;
  notifListEl.innerHTML = "";
  btnBellEl.classList.toggle("has-unread", notifications.some((entry) => !entry.read));
  if (notifications.length === 0) {
    notifListEl.innerHTML = `<div class="notificationItem"><div class="notificationTitle">No notifications</div><div class="notificationBody">Logging action results appear here.</div></div>`;
    return;
  }
  for (const entry of notifications.slice(0, 12)) {
    const item = document.createElement("article");
    item.className = `notificationItem ${entry.tone}`;
    item.innerHTML = `
      <div class="notificationTitle">${escapeHtml(entry.title)}</div>
      <div class="notificationBody">${escapeHtml(entry.body)}</div>
      <div class="notificationMeta">
        <span>${escapeHtml(new Date(entry.ts).toLocaleTimeString())}</span>
      </div>
    `;
    item.addEventListener("click", () => {
      entry.read = true;
      renderNotifications();
      shellChrome?.closeNotificationMenu();
    });
    notifListEl.appendChild(item);
  }
}

function bindUi() {
  shellChrome = bindFirstPartyShellChrome(shell, {
    onNavSelect: (id) => setActiveView(id),
    onNotificationClear: () => {
      notifications.splice(0, notifications.length);
      renderNotifications();
    },
  });
}

function setActiveView(id) {
  const next = ["dashboard", "events", "settings"].includes(id) ? id : "dashboard";
  activeView = next;
  viewDashboardEl?.classList.toggle("hidden", next !== "dashboard");
  viewEventsEl?.classList.toggle("hidden", next !== "events");
  viewSettingsEl?.classList.toggle("hidden", next !== "settings");
  document.querySelectorAll(".navbtn[data-activity]").forEach((button) => {
    const active = button.getAttribute("data-activity") === next;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (next === "dashboard") renderDashboard();
  if (next === "events") {
    renderFilterBuilder();
    renderProjectionStatus();
  }
  if (next === "settings") renderSettings();
}

function isValidEvent(event) {
  try {
    assertLogEventEnvelope(event);
    return true;
  } catch {
    return false;
  }
}

function eventSearchText(event) {
  return JSON.stringify({
    producer: event.producer,
    source: sourceLabel(event),
    category: event.category,
    severity: event.severity,
    outcome: event.outcome,
    verbosity: (event.safeFacts || event.safe_facts || {}).verbosityClass,
    subjectLabel: subjectLabel(event),
    subject: event.subject,
    resource: event.resource,
    correlation: event.correlation,
    tags: event.tags,
    displayTags: displayTags(event),
    safeFacts: event.safeFacts || event.safe_facts || {},
  }).toLowerCase();
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeSuggestionText(value) {
  return String(value || "").trim().toLowerCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapIndex(index, length) {
  if (!length) return 0;
  return ((index % length) + length) % length;
}

function filterTimeLabel(value) {
  const millis = timestampMillis(value);
  if (!millis) return "";
  const date = new Date(millis);
  const datePart = date.toLocaleDateString([], {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  }).replace(/\s/g, "");
  return `${datePart}, ${timePart}`;
}

function formatEventTime(value) {
  const raw = Number(value || 0);
  if (!raw) return "unknown time";
  const millis = raw > 9_999_999_999 ? raw : raw * 1000;
  return new Date(millis).toLocaleString();
}

function shortEventTime(value) {
  const raw = Number(value || 0);
  if (!raw) return "";
  const millis = raw > 9_999_999_999 ? raw : raw * 1000;
  return new Date(millis).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function titleCaseWords(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Pending";
}

function randomOpaqueId(prefix) {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${token}`;
}

function emitDiagnostic(operation, detail = {}) {
  if (!debugEnabled) return;
  const event = {
    at: new Date().toISOString(),
    surface: "logging-ui",
    operation,
    detail: sanitizeDiagnosticDetail(detail),
  };
  const target = window;
  if (!Array.isArray(target.__constituteDiagnostics)) {
    target.__constituteDiagnostics = [];
  }
  target.__constituteDiagnostics.push(event);
  while (target.__constituteDiagnostics.length > DEBUG_RING_LIMIT) {
    target.__constituteDiagnostics.shift();
  }
  console.debug("[logging-ui diagnostic]", operation, event.detail);
}

function sanitizeDiagnosticDetail(detail) {
  const safe = {};
  if (!detail || typeof detail !== "object") return safe;
  for (const [key, value] of Object.entries(detail)) {
    const normalized = String(key || "").toLowerCase();
    if (
      normalized.includes("capability")
      || normalized.includes("token")
      || normalized.includes("secret")
      || normalized.includes("credential")
      || normalized.includes("password")
      || normalized.includes("payload")
    ) {
      safe[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    } else if (Array.isArray(value)) {
      safe[key] = value.slice(0, 8).map((item) => sanitizeDiagnosticValue(item));
    } else {
      safe[key] = sanitizeDiagnosticValue(value);
    }
  }
  return safe;
}

function sanitizeDiagnosticValue(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (!value || typeof value !== "object") return String(value ?? "");
  const safe = {};
  for (const [key, item] of Object.entries(value).slice(0, 12)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) {
      safe[key] = item;
    }
  }
  return safe;
}

function dismissBootSplash() {
  if (bootSplashDismissed) return;
  bootSplashDismissed = true;
  document.body.classList.remove("booting");
  bootSplashEl?.remove();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return String(value ?? "").replace(/[^a-z0-9_-]/gi, "");
}

bindUi();
setActiveView("dashboard");
renderNotifications();
renderRuntimeState();
renderProjectionStatus();
renderDashboard();
renderSettings();
