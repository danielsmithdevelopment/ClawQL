/** Minimal OpenAPI document shape used by AWS auth helpers (avoids clawql-api dependency). */
export type OpenAPIDoc = {
  info?: {
    title?: string;
    version?: string;
    "x-serviceName"?: string;
  };
  servers?: { url?: string }[];
};
