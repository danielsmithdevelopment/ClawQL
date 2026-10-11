import { Context } from "effect";

import type { ProfileProvider } from "../providers/types.js";
import type { SignalRegistryService } from "./signal-registry-core.js";

export class ProfileRegistryService extends Context.Service<
  ProfileRegistryService,
  SignalRegistryService<ProfileProvider>
>()("clawql/ProfileRegistryService") {}
