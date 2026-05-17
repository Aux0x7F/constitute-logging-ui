import { SURFACE_APP, assertSurfaceAppContract } from "../../constitute-protocol/src/index.js";
import { defineSurfaceAppContract } from "../../constitute-ui/src/surface-app-contract.js";

const ISSUED_AT = 1700000000;

export const loggingSurfaceAppContract = assertSurfaceAppContract({
  contractId: "surface-app:constitute-logging-ui",
  schemaVersion: SURFACE_APP.SCHEMA_VERSION,
  appId: "constitute-logging-ui",
  appRef: "app:logging-ui",
  serviceRef: "service:logging",
  surfaceRef: "surface:logging-ui",
  version: "0.1.0",
  displayName: "Logging",
  requiredPrimitives: [
    "runtime.attach",
    "projection.materialization",
    "logging.safe-facts",
  ],
  requiredModuleRoles: [
    SURFACE_APP.MODULE_ROLE.RUNTIME_CLIENT,
    SURFACE_APP.MODULE_ROLE.PROJECTION_MODEL,
    SURFACE_APP.MODULE_ROLE.PRODUCT_VIEW,
  ],
  modules: [
    {
      moduleRef: "constitute-ui/runtime-surface-client@0.1.0",
      role: SURFACE_APP.MODULE_ROLE.RUNTIME_CLIENT,
      participantSide: SURFACE_APP.PARTICIPANT_SIDE.WINDOW,
      fulfillmentMode: SURFACE_APP.FULFILLMENT_MODE.BUNDLED,
      version: "0.1.0",
      primitiveRefs: ["runtime.attach", "runtime.intent"],
      inputs: ["runtime.snapshot", "projection.observer.update"],
      outputs: ["projection.policy.put"],
      issuedAt: ISSUED_AT,
    },
    {
      moduleRef: "constitute-logging-ui/projection-model@0.1.0",
      role: SURFACE_APP.MODULE_ROLE.PROJECTION_MODEL,
      participantSide: SURFACE_APP.PARTICIPANT_SIDE.WINDOW,
      fulfillmentMode: SURFACE_APP.FULFILLMENT_MODE.BUNDLED,
      version: "0.1.0",
      primitiveRefs: ["projection.materialization", "materialization.budget"],
      inputs: ["logging.events", "logging.health", "logging.dashboard"],
      outputs: ["logging.read-model", "consumer.floor"],
      issuedAt: ISSUED_AT,
    },
    {
      moduleRef: "constitute-logging-ui/product-view@0.1.0",
      role: SURFACE_APP.MODULE_ROLE.PRODUCT_VIEW,
      participantSide: SURFACE_APP.PARTICIPANT_SIDE.WINDOW,
      fulfillmentMode: SURFACE_APP.FULFILLMENT_MODE.BUNDLED,
      version: "0.1.0",
      primitiveRefs: ["runtime.posture.render", "privacy.tier.render"],
      inputs: ["logging.read-model"],
      outputs: ["user.intent"],
      issuedAt: ISSUED_AT,
    },
  ],
  projectionSubscriptions: [
    { projectionId: "logging.events", channelId: "logging.events" },
    { projectionId: "logging.health", channelId: "logging.health" },
    { projectionId: "logging.dashboard", channelId: "logging.dashboard" },
  ],
  materializationBudgets: [
    { budgetId: "logging-ui.event-table", maxItems: 2500 },
    { budgetId: "logging-ui.dashboard-shortlist", maxItems: 48 },
  ],
  updatePosture: {
    state: SURFACE_APP.UPDATE_POSTURE.STATIC,
    checkedAt: ISSUED_AT,
  },
  issuedAt: ISSUED_AT,
});

export const loggingSurfaceApp = defineSurfaceAppContract(loggingSurfaceAppContract, {
  validate: assertSurfaceAppContract,
});

export const loggingSurfaceAttachContext = loggingSurfaceApp.attachContext({
  productSurface: "constitute-logging-ui",
});
