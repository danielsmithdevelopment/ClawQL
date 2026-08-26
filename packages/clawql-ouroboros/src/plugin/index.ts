export { makeOuroborosLayer, type OuroborosLayerError } from "./ouroboros-layer.js";
export {
  configureOuroborosPluginDeps,
  resetOuroborosPluginDepsForTests,
  type OuroborosPluginDeps,
  type OuroborosPluginExecuteParams,
  type OuroborosPluginSearchParams,
} from "./deps.js";

export { createOuroborosPlugin, OUROBOROS_PLUGIN_ID, type OuroborosPluginOptions } from "./ouroboros-plugin.js";
export {
  buildOuroborosMcpToolDefinitions,
  type OuroborosToolDefOptions,
} from "./ouroboros-tool-defs.js";

export { getOuroborosContext, resetOuroborosContextForTests, ensureOuroborosPoolShutdownHooks } from "./context.js";

export { closeOuroborosPgPool, getOuroborosPgPool } from "../glue/postgres-pool.js";
export { ouroborosPgPoolScopedEffect } from "../glue/postgres-pool-effect.js";

export {
  OuroborosContextService,
  OuroborosError,
  OuroborosEnginesService,
  OuroborosEventStoreService,
  OuroborosLoopService,
  OuroborosPollerService,
  OuroborosToolsService,
  ouroborosContextLiveLayer,
  ouroborosEnginesLiveLayer,
  ouroborosEventStoreLiveLayer,
  ouroborosLoopLiveLayer,
  ouroborosPollerLiveLayer,
  ouroborosCreateSeedProgram,
  ouroborosLineageProgram,
  ouroborosMeasureDriftProgram,
  ouroborosProposeRevisionProgram,
  ouroborosRunLoopProgram,
  ouroborosServicesLiveLayer,
  ouroborosToolsLiveLayer,
  runOuroborosEffect,
  type OuroborosServices,
} from "../effect/index.js";
