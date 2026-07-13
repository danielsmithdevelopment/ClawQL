import type { Express, Request, Response } from "express";
import { renderMppOpenApiJson, type BuildMppOpenApiOptions } from "./openapi.js";

export const MPP_OPENAPI_PATH = "/openapi.json";

export type AttachMppOpenApiOptions = BuildMppOpenApiOptions & {
  maxAgeSeconds?: number;
};

export async function handleMppOpenApiRequest(
  req: Request,
  res: Response,
  options: AttachMppOpenApiOptions = {}
): Promise<void> {
  const origin =
    options.origin ??
    (req.get("x-forwarded-proto") && req.get("host")
      ? `${req.get("x-forwarded-proto")}://${req.get("host")}`
      : `${req.protocol}://${req.get("host") ?? "localhost"}`);

  const body = await renderMppOpenApiJson({
    ...options,
    origin,
  });

  const maxAge = options.maxAgeSeconds ?? 300;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
  res.status(200).send(body);
}

export function attachMppOpenApiRoutes(
  app: Express,
  options: AttachMppOpenApiOptions = {}
): void {
  app.get(MPP_OPENAPI_PATH, (req, res) => {
    void handleMppOpenApiRequest(req, res, options).catch((err: unknown) => {
      console.error("[clawql-payments] GET /openapi.json error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          error: "failed to render MPP OpenAPI discovery document",
        });
      }
    });
  });
}
