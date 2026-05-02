import "constitute-ui/styles.css";
import "./styles.css";
import {
  renderAccountCenterSummary,
  renderFirstPartyShell,
  setConnectionStateText,
} from "constitute-ui";
import { assertLogEventEnvelope } from "constitute-protocol";

const API_URL_STORAGE_KEY = "constitute.logging-ui.api-url";
const DEFAULT_API_URL = "http://127.0.0.1:7480";

const MAIN_HTML = `
  <div class="loggingMain">
    <section id="loggingViewLive" class="loggingView">
      <section class="cuPanel">
        <div class="cuPanelHeader">
          <div>
            <h2 class="cuPanelTitle">Live Tail</h2>
            <p class="cuPanelHint">Recent safe log facts from the selected logging service.</p>
          </div>
          <button id="btnRefresh" type="button" class="cuAction">Refresh</button>
        </div>
        <div class="loggingControls">
          <label class="loggingField">Logging API
            <input id="apiUrlInput" class="loggingInput" autocomplete="off" />
          </label>
          <label class="loggingField">Severity
            <input id="severityInput" class="loggingInput" placeholder="error, warning, info" />
          </label>
          <label class="loggingField">Category
            <input id="categoryInput" class="loggingInput" placeholder="serviceAccess, worker" />
          </label>
          <label class="loggingField">Search
            <input id="searchInput" class="loggingInput" placeholder="service, resource, fact" />
          </label>
        </div>
        <div id="liveStatus" class="loggingMuted"></div>
        <div id="eventList" class="loggingList"></div>
      </section>
    </section>
    <section id="loggingViewHealth" class="loggingView hidden">
      <div class="loggingGrid">
        <section class="cuPanel">
          <div class="cuPanelHeader">
            <div>
              <h2 class="cuPanelTitle">Logging Health</h2>
              <p class="cuPanelHint">Service status and local hot index state.</p>
            </div>
          </div>
          <div id="healthRows" class="loggingRows"></div>
        </section>
        <section class="cuPanel">
          <div class="cuPanelHeader">
            <div>
              <h2 class="cuPanelTitle">Archive</h2>
              <p class="cuPanelHint">Storage archive and pin-offer posture.</p>
            </div>
          </div>
          <div id="archiveRows" class="loggingRows"></div>
        </section>
      </div>
    </section>
  </div>
`;

const app = document.querySelector("#app");
if (!app) throw new Error("#app not found");

const shell = renderFirstPartyShell(app, {
  appName: "Logging",
  navItems: [
    { id: "live", label: "Live Tail", active: true },
    { id: "health", label: "Health / Archive" },
  ],
  mainHtml: MAIN_HTML,
  accountCenterTitle: "Account",
});

const bootSplashEl = document.getElementById("bootSplash");
const apiUrlInput = document.getElementById("apiUrlInput");
const severityInput = document.getElementById("severityInput");
const categoryInput = document.getElementById("categoryInput");
const searchInput = document.getElementById("searchInput");
const eventListEl = document.getElementById("eventList");
const liveStatusEl = document.getElementById("liveStatus");
const healthRowsEl = document.getElementById("healthRows");
const archiveRowsEl = document.getElementById("archiveRows");
const btnRefresh = document.getElementById("btnRefresh");
const liveView = document.getElementById("loggingViewLive");
const healthView = document.getElementById("loggingViewHealth");

let events = [];
let watchSocket = null;

const launchParams = new URLSearchParams(window.location.search || "");
apiUrlInput.value = launchParams.get("api") || localStorage.getItem(API_URL_STORAGE_KEY) || DEFAULT_API_URL;

for (const button of shell.navButtons || []) {
  button.addEventListener("click", () => showView(button.dataset.nav));
}

btnRefresh.addEventListener("click", () => refreshAll());
for (const input of [apiUrlInput, severityInput, categoryInput, searchInput]) {
  input.addEventListener("change", () => refreshAll());
}

renderAccountCenterSummary(shell.accountCenterSummaryEl, {
  handle: "@runtime",
  linked: true,
  connectionLabel: "local",
  connectionToneClass: "connStateText-connected",
});
setConnectionStateText(shell.connStateTextEl, {
  label: "local",
  toneClass: "connStateText-connected",
});

refreshAll().finally(() => {
  document.body.classList.remove("booting");
  bootSplashEl?.remove();
});

function apiBase() {
  const value = String(apiUrlInput.value || DEFAULT_API_URL).trim().replace(/\/+$/, "");
  localStorage.setItem(API_URL_STORAGE_KEY, value);
  return value;
}

function showView(view) {
  for (const button of shell.navButtons || []) {
    button.classList.toggle("active", button.dataset.nav === view);
  }
  liveView.classList.toggle("hidden", view !== "live");
  healthView.classList.toggle("hidden", view !== "health");
}

async function refreshAll() {
  await Promise.allSettled([refreshHealth(), refreshEvents()]);
  connectWatch();
}

async function refreshHealth() {
  try {
    const response = await fetch(`${apiBase()}/health`);
    if (!response.ok) throw new Error(`health ${response.status}`);
    const health = await response.json();
    renderRows(healthRowsEl, [
      ["status", health.status || "unknown"],
      ["events", String(health.events ?? 0)],
      ["producers", String(health.producers ?? 0)],
    ]);
    renderRows(archiveRowsEl, [
      ["storage", health.storageStatus || "unknown"],
      ["container", health.archiveContainerId || "unknown"],
    ]);
  } catch (error) {
    renderRows(healthRowsEl, [["status", "unavailable"], ["error", String(error?.message || error)]]);
    renderRows(archiveRowsEl, [["storage", "unknown"]]);
  }
}

async function refreshEvents() {
  const params = new URLSearchParams();
  if (severityInput.value.trim()) params.set("severity", severityInput.value.trim());
  if (categoryInput.value.trim()) params.set("category", categoryInput.value.trim());
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  params.set("limit", "100");
  try {
    liveStatusEl.textContent = "refreshing";
    const response = await fetch(`${apiBase()}/v1/events/search?${params}`);
    if (!response.ok) throw new Error(`search ${response.status}`);
    const payload = await response.json();
    events = Array.isArray(payload.events) ? payload.events.filter(isValidEvent) : [];
    liveStatusEl.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
    renderEvents();
  } catch (error) {
    liveStatusEl.textContent = `unavailable: ${String(error?.message || error)}`;
    eventListEl.innerHTML = `<div class="loggingEmpty">No logging service response.</div>`;
  }
}

function connectWatch() {
  if (watchSocket) return;
  try {
    const url = new URL(`${apiBase()}/v1/watch`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    watchSocket = new WebSocket(url);
    watchSocket.onmessage = () => refreshEvents();
    watchSocket.onclose = () => {
      watchSocket = null;
      setTimeout(connectWatch, 2000);
    };
    watchSocket.onerror = () => {
      watchSocket?.close();
    };
  } catch {
    watchSocket = null;
  }
}

function isValidEvent(event) {
  try {
    assertLogEventEnvelope(event);
    return true;
  } catch {
    return false;
  }
}

function renderEvents() {
  eventListEl.replaceChildren();
  if (!events.length) {
    eventListEl.innerHTML = `<div class="loggingEmpty">No events match the current filters.</div>`;
    return;
  }
  for (const event of events) {
    const item = document.createElement("article");
    item.className = "loggingEvent";
    const severity = String(event.severity || "info");
    const subject = event.subject?.display || event.subject?.id || event.producer?.service || "event";
    item.innerHTML = `
      <div class="loggingEventHeader">
        <div>
          <h3 class="loggingEventTitle">${escapeHtml(subject)}</h3>
          <div class="loggingMuted">${escapeHtml(event.producer?.service || "")} / ${escapeHtml(event.category || "")} / ${new Date(Number(event.occurredAt || 0) * 1000).toLocaleString()}</div>
        </div>
        <span class="loggingPill loggingPill-${escapeAttr(severity)}">${escapeHtml(severity)}</span>
      </div>
      <pre class="loggingCode">${escapeHtml(JSON.stringify(event.safeFacts || {}, null, 2))}</pre>
      ${event.detailRef ? `<div class="loggingMuted">Encrypted detail available. Decrypt/view is client-side only.</div>` : ""}
    `;
    eventListEl.appendChild(item);
  }
}

function renderRows(container, rows) {
  container.replaceChildren();
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "loggingRow";
    row.innerHTML = `<span class="loggingMuted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    container.appendChild(row);
  }
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
