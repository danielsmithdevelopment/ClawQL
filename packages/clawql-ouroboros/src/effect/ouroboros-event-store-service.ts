import { Context, Effect, Layer } from "effect";
import type { EventStore, StoredEvent } from "../interfaces.js";
import type { OntologyLineage } from "../lineage.js";
import { getOrCreateOuroborosEventStore } from "../glue/create-event-store.js";
import { OuroborosError } from "./ouroboros-errors.js";
import { ouroborosFromPromise } from "./ouroboros-effect-utils.js";

/** Effect service for durable Ouroboros lineage event storage. */
export class OuroborosEventStoreService extends Context.Tag("clawql/OuroborosEventStoreService")<
  OuroborosEventStoreService,
  {
    readonly getStore: () => EventStore;
    readonly append: (event: StoredEvent) => Effect.Effect<void, OuroborosError>;
    readonly getLineage: (seedId: string) => Effect.Effect<OntologyLineage, OuroborosError>;
  }
>() {}

export function ouroborosEventStoreLiveLayer(): Layer.Layer<OuroborosEventStoreService> {
  const store = getOrCreateOuroborosEventStore();
  return Layer.succeed(
    OuroborosEventStoreService,
    OuroborosEventStoreService.of({
      getStore: () => store,
      append: (event) => ouroborosFromPromise(() => store.append(event)),
      getLineage: (seedId) => ouroborosFromPromise(() => store.getLineage(seedId)),
    })
  );
}
