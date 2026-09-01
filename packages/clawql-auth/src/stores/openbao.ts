/**
 * OpenBao SecretStore — Apache 2.0 community fork of Vault (BSL-free).
 * API-compatible with HashiCorp Vault KV v2; prefer this for open-source self-host.
 */

import {
  HashiCorpVaultStore,
  type HashiCorpVaultStoreOptions,
  type VaultHttpClient,
} from "./hashicorp-vault.js";

export type OpenBaoStoreOptions = HashiCorpVaultStoreOptions;

/**
 * Same HTTP API as Vault — different product / license (Apache 2.0).
 * Point `endpoint` at OpenBao (`BAO_ADDR` / OpenBao listener).
 */
export class OpenBaoStore extends HashiCorpVaultStore {
  override readonly kind = "openbao" as const;

  constructor(options: OpenBaoStoreOptions) {
    super(options);
  }
}

export function createOpenBaoStore(options: OpenBaoStoreOptions): OpenBaoStore {
  return new OpenBaoStore(options);
}

export type { VaultHttpClient };
