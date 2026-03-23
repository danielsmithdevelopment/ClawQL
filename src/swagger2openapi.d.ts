declare module "swagger2openapi" {
  export function convertObj(
    swagger: object,
    options?: Record<string, unknown>
  ): Promise<{ openapi: object }>;
}
