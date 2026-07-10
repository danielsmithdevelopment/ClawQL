import type { SyncProvider } from "./types.js";

export type SyncProviderProfile = {
  id: SyncProvider;
  label: string;
  defaultEndpoint?: string;
  defaultRegion?: string;
  /** S3 API path-style (R2 + GCS interop); AWS S3 uses virtual-hosted. */
  forcePathStyle: boolean;
};

export const SYNC_PROVIDER_PROFILES: Record<SyncProvider, SyncProviderProfile> = {
  r2: {
    id: "r2",
    label: "Cloudflare R2",
    defaultRegion: "auto",
    forcePathStyle: true,
  },
  s3: {
    id: "s3",
    label: "Amazon S3",
    forcePathStyle: false,
  },
  gcs: {
    id: "gcs",
    label: "Google Cloud Storage",
    defaultEndpoint: "https://storage.googleapis.com",
    defaultRegion: "auto",
    forcePathStyle: true,
  },
};

export function syncProviderProfile(provider: SyncProvider): SyncProviderProfile {
  return SYNC_PROVIDER_PROFILES[provider];
}
