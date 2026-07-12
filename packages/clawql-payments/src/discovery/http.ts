import type { Express, Request, Response } from "express";
import { renderPaymentsWellKnownJson, type BuildPaymentsWellKnownOptions } from "./well-known.js";

export const PAYMENTS_WELL_KNOWN_PATH = "/.well-known/payments.json";

export type AttachPaymentsWellKnownOptions = BuildPaymentsWellKnownOptions & {
  /** Cache-Control max-age seconds (default 300). */
  maxAgeSeconds?: number;
};

export async function handlePaymentsWellKnownRequest(
  req: Request,
  res: Response,
  options: AttachPaymentsWellKnownOptions = {}
): Promise<void> {
  const origin =
    options.origin ??
    (req.get("x-forwarded-proto") && req.get("host")
      ? `${req.get("x-forwarded-proto")}://${req.get("host")}`
      : `${req.protocol}://${req.get("host") ?? "localhost"}`);

  const body = await renderPaymentsWellKnownJson({
    ...options,
    origin,
  });

  const maxAge = options.maxAgeSeconds ?? 300;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
  res.status(200).send(body);
}

export function attachPaymentsWellKnownRoutes(
  app: Express,
  options: AttachPaymentsWellKnownOptions = {}
): void {
  app.get(PAYMENTS_WELL_KNOWN_PATH, (req, res) => {
    void handlePaymentsWellKnownRequest(req, res, options).catch((err: unknown) => {
      console.error("[clawql-payments] GET /.well-known/payments.json error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          error: "failed to render payments discovery document",
        });
      }
    });
  });
}
