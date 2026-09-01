import { Context } from "effect";

import type { MetricProvider } from "../providers/types.js";
import type { SignalRegistryService } from "./signal-registry-core.js";

export class MetricRegistryService extends Context.Tag("clawql/MetricRegistryService")<
  MetricRegistryService,
  SignalRegistryService<MetricProvider>
>() {}
