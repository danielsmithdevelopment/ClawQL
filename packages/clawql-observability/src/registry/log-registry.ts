import { Context } from "effect";

import type { LogProvider } from "../providers/types.js";
import type { SignalRegistryService } from "./signal-registry-core.js";

export class LogRegistryService extends Context.Service<LogRegistryService, SignalRegistryService<LogProvider>>()("clawql/LogRegistryService") {}
