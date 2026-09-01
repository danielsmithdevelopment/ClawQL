import { Context } from "effect";

import type { TraceProvider } from "../providers/types.js";
import type { SignalRegistryService } from "./signal-registry-core.js";

export class TraceRegistryService extends Context.Tag("clawql/TraceRegistryService")<
  TraceRegistryService,
  SignalRegistryService<TraceProvider>
>() {}
