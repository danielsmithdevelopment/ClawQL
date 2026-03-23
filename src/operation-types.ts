/**
 * Shared operation shape for Discovery-derived and native OpenAPI specs.
 */

export interface Operation {
  id: string;
  method: string;
  path: string;
  flatPath: string;
  description: string;
  resource: string;
  parameters: Record<string, ParameterInfo>;
  scopes: string[];
  requestBody?: string;
  responseBody?: string;
}

export interface ParameterInfo {
  type: string;
  location: "path" | "query";
  required: boolean;
  description: string;
}
