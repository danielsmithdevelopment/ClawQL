import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import {
  appendAudit,
  deliverEventToSubscriptions,
  getWorld,
  newId,
  pushEvent,
  redactPii,
} from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const org = req.headers.get("x-org");
      if (org && org !== "acme" && org !== "org_acme") {
        // Cross-tenant: never reveal Acme existence (SEC-04)
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json({ documents: getWorld().documents });
    }),
  );
}

export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      const key = yield* h.keyByBearer(req.headers.get("authorization"));
      const body = (yield* Effect.tryPromise({
        try: () =>
          req.json() as Promise<{
            name?: string;
            content?: string;
            kind?: string;
            confirmField?: string;
            actor?: string;
          }>,
        catch: () => ({}),
      })) as {
        name?: string;
        content?: string;
        kind?: string;
        confirmField?: string;
        actor?: string;
      };

      if (body.confirmField) {
        const doc = world.documents.find((d) => d.lowConfidence);
        if (doc) {
          doc.fields[body.confirmField] = String(doc.fields[body.confirmField] ?? "verified");
          doc.verifiedBy = body.actor ?? "Dana Reyes";
          doc.status = "Stored";
          doc.lowConfidence = false;
          appendAudit(doc.verifiedBy, "document.confirm_field", "Verified", {
            field: body.confirmField,
            documentId: doc.id,
          });
          return NextResponse.json({ ok: true, document: doc });
        }
      }

      const name = body.name ?? "upload.bin";
      if (name.toLowerCase().endsWith(".msg")) {
        const id = newId("doc");
        world.documents.push({
          id,
          name,
          status: "Couldn't read",
          redacted: false,
          fields: {},
        });
        appendAudit("upload", "document.upload", "Couldn't read — convert to PDF or EML", {
          id,
          name,
        });
        return NextResponse.json({
          ok: false,
          id,
          status: "Couldn't read",
          hint: "Convert Outlook .msg to PDF or EML",
        });
      }

      let content = body.content ?? "";
      // Strip script/html for SEC-10 — store as plain text
      content = content.replace(/<[^>]+>/g, "");
      const { text, redacted } = redactPii(content);
      if (/\[REDACTED_KEY\]/.test(text)) {
        world.alerts.push({
          channel: "admin",
          kind: "key-in-document",
          at: new Date().toISOString(),
        });
      }

      const id = newId("doc");
      const doc = {
        id,
        name,
        status: "Stored",
        redacted,
        fields: {
          text,
          counterparty: text.includes("Northwind") ? "Northwind Partners" : "Unknown",
        },
        lowConfidence: /low.?confidence|uncertain/i.test(content),
      };
      world.documents.push(doc);

      if (key?.name === "docs-pipeline") {
        world.sessions.push({
          id: newId("sess"),
          keyName: key.name,
          spendCents: 0,
          upload: true,
        });
        appendAudit(key.name, "document.upload", "Upload credited to agent", { id });
      }

      const evt = pushEvent("document.processed", {
        documentId: id,
        name,
        redacted,
        text,
      });
      appendAudit("upload", "document.processed", redacted ? "Stored, redacted" : "Stored", {
        id,
        name,
      });
      yield* Effect.tryPromise({
        try: () => deliverEventToSubscriptions(evt),
        catch: () => undefined as void,
      });
      return NextResponse.json({
        ok: true,
        id,
        status: "Stored",
        redacted,
        fields: doc.fields,
        eventId: evt.id,
      });
    }),
  );
}
