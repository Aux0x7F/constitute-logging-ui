import {
  SURFACE_APP,
  SWARM,
  assertServiceManagerSecretBoundary,
  assertSurfaceAppBootstrapContract,
  assertSurfaceAppInstancePosture,
  assertSurfaceAppManifest,
  assertSurfaceAppRuntimeSelectionPosture,
  assertSurfaceAppContract,
  assertSurfaceAppRunnerPlan,
} from "../../constitute-protocol/src/index.js";
import {
  defineSurfaceAppContract,
  surfaceAppBootstrapPosture,
  surfaceAppInstancePosture,
  surfaceAppRuntimeSelectionPosture,
  surfaceAppRunnerPlan,
  surfaceServiceManagerOperationPosture,
  surfaceServiceManagerProofDigest,
} from "../../constitute-ui/src/surface-app-contract.js";
import { createRuntimeSurfaceClient } from "../../constitute-ui/src/runtime-surface-client.js";
import {
  createSurfaceModuleRegistry,
  surfaceAppModuleBindings,
} from "../../constitute-ui/src/surface-module-registry.js";
import {
  projectionCoverage,
  projectionDeltaFor,
  projectionNodePath,
  projectionRecordPolicyId,
  projectionRepairFor,
  projectionRuntimeKey,
  projectionUpdatedAt,
  selectProjectionForNode,
} from "../../constitute-ui/src/projection-read-model.js";

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
    {
      kind: SWARM.RECORD_KIND.MATERIALIZATION_BUDGET,
      budgetId: "logging-ui.projection-signature",
      sourceAuthority: "runtime.projection.snapshot",
      consumerRef: "logging-ui.projection-signature",
      payloadClass: SWARM.MATERIALIZATION_PAYLOAD_CLASS.PROJECTION,
      copyRole: SWARM.MATERIALIZATION_COPY_ROLE.PROJECTION,
      transferMode: SWARM.MATERIALIZATION_TRANSFER_MODE.CLONE,
      privacyTier: SWARM.MATERIALIZATION_PRIVACY_TIER.SAFE_PROJECTION,
      state: SWARM.RESOURCE_POSTURE_STATE.WITHIN_BUDGET,
      limits: { maxProjectionCount: 3, maxSignatureBytes: 64_000 },
      snapshotPolicy: { mode: "semantic-signature" },
      deltaPolicy: { mode: "signature-only" },
      coalescing: { key: "projectionRuntimeKey" },
      cardinality: { projectionKeys: 3 },
      schema: { state: SWARM.MATERIALIZATION_SCHEMA_STATE.CURRENT, version: "logging-ui.projection-signature.v1" },
      issuedAt: ISSUED_AT,
    },
    {
      kind: SWARM.RECORD_KIND.MATERIALIZATION_BUDGET,
      budgetId: "logging-ui.projection-selection",
      sourceAuthority: "runtime.projection.snapshot",
      consumerRef: "logging-ui.projection-selector",
      payloadClass: SWARM.MATERIALIZATION_PAYLOAD_CLASS.PROJECTION,
      copyRole: SWARM.MATERIALIZATION_COPY_ROLE.REFERENCE_ONLY,
      transferMode: SWARM.MATERIALIZATION_TRANSFER_MODE.REFERENCE_ONLY,
      privacyTier: SWARM.MATERIALIZATION_PRIVACY_TIER.SAFE_PROJECTION,
      state: SWARM.RESOURCE_POSTURE_STATE.WITHIN_BUDGET,
      limits: { maxProjectionCount: 3 },
      snapshotPolicy: { mode: "single-pass-node-selection" },
      deltaPolicy: { mode: "selection-only" },
      coalescing: { key: "projectionRuntimeKey" },
      cardinality: { maxNodePaths: 3 },
      schema: { state: SWARM.MATERIALIZATION_SCHEMA_STATE.CURRENT, version: "logging-ui.projection-selection.v1" },
      referenceRefs: ["runtime.projection.snapshot"],
      issuedAt: ISSUED_AT,
    },
    {
      kind: SWARM.RECORD_KIND.MATERIALIZATION_BUDGET,
      budgetId: "logging-ui.event-table",
      sourceAuthority: "runtime.logging.events.projection",
      consumerRef: "logging-ui.events-view",
      payloadClass: SWARM.MATERIALIZATION_PAYLOAD_CLASS.PROJECTION,
      copyRole: SWARM.MATERIALIZATION_COPY_ROLE.REFERENCE_ONLY,
      transferMode: SWARM.MATERIALIZATION_TRANSFER_MODE.REFERENCE_ONLY,
      privacyTier: SWARM.MATERIALIZATION_PRIVACY_TIER.UI_PROJECTION,
      state: SWARM.RESOURCE_POSTURE_STATE.WITHIN_BUDGET,
      limits: {
        maxItems: 2500,
        maxSourceItems: 2500,
        maxSafeFactKeys: 64,
        maxLabelValues: 250,
        maxEncryptedDetailRefs: 2500,
      },
      snapshotPolicy: { mode: "runtime-projection-owned" },
      deltaPolicy: { mode: "coalesced-by-event-key" },
      coalescing: { key: "eventMaterializationKey" },
      cardinality: { maxEventKeys: 2500, maxSafeFactKeys: 64, maxLabelValues: 250, labelOverflow: "detailRef" },
      schema: { state: SWARM.MATERIALIZATION_SCHEMA_STATE.CURRENT, version: "logging-ui.event-table.v1" },
      referenceRefs: ["logging-ui.events"],
      retentionClass: "ephemeral.ui-projection",
      issuedAt: ISSUED_AT,
    },
    {
      kind: SWARM.RECORD_KIND.MATERIALIZATION_BUDGET,
      budgetId: "logging-ui.dashboard-shortlist",
      sourceAuthority: "runtime.logging.dashboard.projection",
      consumerRef: "logging-ui.dashboard-shortlist",
      payloadClass: SWARM.MATERIALIZATION_PAYLOAD_CLASS.PROJECTION,
      copyRole: SWARM.MATERIALIZATION_COPY_ROLE.REFERENCE_ONLY,
      transferMode: SWARM.MATERIALIZATION_TRANSFER_MODE.REFERENCE_ONLY,
      privacyTier: SWARM.MATERIALIZATION_PRIVACY_TIER.UI_PROJECTION,
      state: SWARM.RESOURCE_POSTURE_STATE.WITHIN_BUDGET,
      limits: { maxItems: 48, maxRenderedItems: 8 },
      snapshotPolicy: { mode: "runtime-dashboard-or-local-reference" },
      deltaPolicy: { mode: "coalesced-by-event-key" },
      coalescing: { key: "eventMaterializationKey" },
      cardinality: { maxSeverityBands: 4 },
      schema: { state: SWARM.MATERIALIZATION_SCHEMA_STATE.CURRENT, version: "logging-ui.dashboard-shortlist.v1" },
      referenceRefs: ["logging-ui.dashboard"],
      retentionClass: "ephemeral.ui-projection",
      issuedAt: ISSUED_AT,
    },
  ],
  updatePosture: {
    state: SURFACE_APP.UPDATE_POSTURE.STATIC,
    checkedAt: ISSUED_AT,
  },
  serviceManagerPosture: {
    managerId: "manager:manual:logging-ui",
    subjectRef: "service:logging",
    managerRef: "manager:manual:logging-ui",
    state: SURFACE_APP.SERVICE_MANAGER_POSTURE.MANUAL,
    serviceRefs: ["service:logging"],
    capabilityRefs: ["service.manage"],
    evidenceRefs: ["build:logging-ui:local"],
    issuedAt: ISSUED_AT,
  },
  secretBoundary: {
    state: SURFACE_APP.SECRET_BOUNDARY.NOT_REQUIRED,
  },
  releasePosture: {
    state: SURFACE_APP.RELEASE_POSTURE.STATIC,
    evidenceRefs: ["build:logging-ui:local"],
  },
  issuedAt: ISSUED_AT,
});

export const loggingSurfaceApp = defineSurfaceAppContract(loggingSurfaceAppContract, {
  validate: assertSurfaceAppContract,
});

export const loggingSurfaceAppManifest = assertSurfaceAppManifest({
  kind: "surface.app.manifest",
  manifestId: "manifest:logging-ui",
  appId: "constitute-logging-ui",
  state: SURFACE_APP.MANIFEST_VERSION_STATE.CURRENT,
  currentAppContractRef: "app:logging-ui",
  currentVersion: "0.1.0",
  defaultSourceMode: SURFACE_APP.FULFILLMENT_MODE.BUNDLED,
  requiredModuleRoles: [
    SURFACE_APP.MODULE_ROLE.RUNTIME_CLIENT,
    SURFACE_APP.MODULE_ROLE.PROJECTION_MODEL,
    SURFACE_APP.MODULE_ROLE.PRODUCT_VIEW,
  ],
  bundledSourceRefs: ["bundle:logging-ui@0.1.0"],
  compatibilityWindow: {
    minVersion: "0.1.0",
    maxVersion: "0.1.x",
    protocolRef: "protocol:surface-app:v1",
  },
  versions: [
    {
      appContractRef: "app:logging-ui",
      version: "0.1.0",
      state: SURFACE_APP.MANIFEST_VERSION_STATE.CURRENT,
      sourceMode: SURFACE_APP.FULFILLMENT_MODE.BUNDLED,
      requiredModuleRoles: [
        SURFACE_APP.MODULE_ROLE.RUNTIME_CLIENT,
        SURFACE_APP.MODULE_ROLE.PROJECTION_MODEL,
        SURFACE_APP.MODULE_ROLE.PRODUCT_VIEW,
      ],
      compatibilityWindow: {
        minVersion: "0.1.0",
        maxVersion: "0.1.x",
        protocolRef: "protocol:surface-app:v1",
      },
      bundledSourceRefs: ["bundle:logging-ui@0.1.0"],
      grantRefs: ["grant:app:logging-ui:run"],
      runnerRequirementRefs: ["runner:req:logging-ui"],
      serviceManagerRequirementRefs: ["service-manager:req:logging-ui"],
      compatibilityRefs: ["protocol:surface-app:v1"],
      bootstrapContractRef: "bootstrap-contract:app:logging-ui",
      releaseContractRef: "release:logging-ui:local",
      issuedAt: ISSUED_AT,
    },
  ],
  appContractRefs: ["app:logging-ui"],
  grantRefs: ["grant:app:logging-ui:run"],
  runnerRequirementRefs: ["runner:req:logging-ui"],
  serviceManagerRequirementRefs: ["service-manager:req:logging-ui"],
  compatibilityRefs: ["protocol:surface-app:v1"],
  bootstrapContractRefs: ["bootstrap-contract:app:logging-ui"],
  releaseContractRefs: ["release:logging-ui:local"],
  authorityRefs: ["authority:logging-ui:local"],
  evidenceRefs: ["build:logging-ui:local"],
  issuedAt: ISSUED_AT,
});

export const loggingSurfaceRuntimeSelectionPosture = assertSurfaceAppRuntimeSelectionPosture(surfaceAppRuntimeSelectionPosture(
  loggingSurfaceAppManifest,
  [loggingSurfaceApp],
  {
    runtimeVersion: "0.1.0",
    issuedAt: ISSUED_AT,
  },
));

export const loggingSurfaceModuleRegistry = createSurfaceModuleRegistry([
  {
    moduleRef: "constitute-ui/runtime-surface-client@0.1.0",
    role: SURFACE_APP.MODULE_ROLE.RUNTIME_CLIENT,
    version: "0.1.0",
    primitiveRefs: ["runtime.attach", "runtime.intent"],
    implementation: Object.freeze({ createRuntimeSurfaceClient }),
  },
  {
    moduleRef: "constitute-logging-ui/projection-model@0.1.0",
    role: SURFACE_APP.MODULE_ROLE.PROJECTION_MODEL,
    version: "0.1.0",
    primitiveRefs: ["projection.materialization", "materialization.budget"],
    implementation: Object.freeze({
      projectionCoverage,
      projectionDeltaFor,
      projectionNodePath,
      projectionRecordPolicyId,
      projectionRepairFor,
      projectionRuntimeKey,
      projectionUpdatedAt,
      selectProjectionForNode,
    }),
  },
  {
    moduleRef: "constitute-logging-ui/product-view@0.1.0",
    role: SURFACE_APP.MODULE_ROLE.PRODUCT_VIEW,
    version: "0.1.0",
    primitiveRefs: ["runtime.posture.render", "privacy.tier.render"],
    implementation: Object.freeze({ surfaceRef: "constitute-logging-ui" }),
  },
]);

export const loggingSurfaceModules = surfaceAppModuleBindings(
  loggingSurfaceModuleRegistry,
  loggingSurfaceRuntimeSelectionPosture,
  {
    runtimeClient: SURFACE_APP.MODULE_ROLE.RUNTIME_CLIENT,
    projectionModel: SURFACE_APP.MODULE_ROLE.PROJECTION_MODEL,
    productView: SURFACE_APP.MODULE_ROLE.PRODUCT_VIEW,
  },
);

export const loggingSurfaceRunnerPlan = assertSurfaceAppRunnerPlan(surfaceAppRunnerPlan(loggingSurfaceApp, {
  issuedAt: ISSUED_AT,
}));

export const loggingServiceManagerSecretBoundary = assertServiceManagerSecretBoundary(
  loggingSurfaceRunnerPlan.secretBoundary,
);

export const loggingSurfaceBootstrapContract = assertSurfaceAppBootstrapContract(
  loggingSurfaceRunnerPlan.bootstrapContract,
);

export const loggingSurfaceBootstrapPosture = surfaceAppBootstrapPosture(loggingSurfaceApp, {
  issuedAt: ISSUED_AT,
});

export const loggingServiceManagerOperationPosture = surfaceServiceManagerOperationPosture(loggingSurfaceApp, {
  operation: SURFACE_APP.SERVICE_MANAGER_OPERATION.HEALTH_CHECK,
  operationId: "operation:logging-ui:bootstrap-health",
  requestedAt: ISSUED_AT,
});

export const loggingServiceManagerProofDigest = surfaceServiceManagerProofDigest(loggingSurfaceApp, {
  operationPosture: loggingServiceManagerOperationPosture,
  digestId: "proof-digest:logging-ui:bootstrap",
  observedAt: ISSUED_AT,
});

export const loggingSurfaceAppInstancePosture = assertSurfaceAppInstancePosture(surfaceAppInstancePosture(loggingSurfaceApp, {
  runtimeSelectionPosture: loggingSurfaceRuntimeSelectionPosture,
  moduleBindings: loggingSurfaceModules,
  runnerPlan: loggingSurfaceRunnerPlan,
  bootstrapContract: loggingSurfaceBootstrapContract,
  bootstrapPosture: loggingSurfaceBootstrapPosture,
  serviceManagerOperationPosture: loggingServiceManagerOperationPosture,
  serviceManagerProofDigest: loggingServiceManagerProofDigest,
  issuedAt: ISSUED_AT,
}));

export const loggingRuntimeClientModule = loggingSurfaceModules.byKey.runtimeClient.implementation;

export const loggingProjectionModelModule = loggingSurfaceModules.byKey.projectionModel.implementation;

export const loggingSurfaceAttachContext = loggingSurfaceApp.attachContext({
  productSurface: "constitute-logging-ui",
  runtimeSelectionPosture: loggingSurfaceRuntimeSelectionPosture,
  runnerPlan: loggingSurfaceRunnerPlan,
  appInstancePosture: loggingSurfaceAppInstancePosture,
  bootstrapContract: loggingSurfaceBootstrapContract,
  serviceManagerSecretBoundary: loggingServiceManagerSecretBoundary,
  bootstrapPosture: loggingSurfaceBootstrapPosture,
  serviceManagerOperationPosture: loggingServiceManagerOperationPosture,
  serviceManagerProofDigest: loggingServiceManagerProofDigest,
});
