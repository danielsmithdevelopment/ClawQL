export {
  MemoryGatewayService,
  MemoryGatewayLive,
  runMemoryGatewayIngest,
  runMemoryGatewaySearch,
  runMemoryGatewayList,
  runMemoryGatewayGet,
  runMemoryGatewayErase,
  type MemoryListEntry,
  type MemoryGetResult,
  type MemoryEraseResult,
} from "./service.js";

export { createMemoryRouter, type CreateMemoryRouterOptions } from "./router.js";

export {
  memoryEnrichmentRequested,
  maybeEnrichMessages,
  MEMORY_CONTEXT_BEGIN,
  MEMORY_CONTEXT_END,
  type MemoryEnrichDecision,
} from "./enrichment.js";
