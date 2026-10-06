import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import {
  appendAudit,
  getWorld,
  newId,
  personByName,
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
      const world = getWorld();
      const url = new URL(req.url);
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const filter = url.searchParams.get("filter") ?? "";
      const includeStale = url.searchParams.get("includeStale") === "1";
      const actor = url.searchParams.get("actor") ?? "Dana Reyes";
      const person = personByName(actor);
      const sql = url.searchParams.get("sql");

      // Erased subjects never appear
      if (world.erasedSubjects.some((s) => q && s.toLowerCase().includes(q))) {
        return NextResponse.json({ results: [], found: false });
      }

      if (sql) {
        if (/^\s*(insert|update|delete|drop|alter)/i.test(sql)) {
          appendAudit(actor, "memory.sql", "Write refused");
          return NextResponse.json({ error: "write refused" }, { status: 403 });
        }
        const rows = world.memoryNotes
          .filter((n) => !n.erased && !n.personal)
          .map((n) => ({ id: n.id, title: n.title, ...n.fields }));
        return NextResponse.json({ rows, readOnly: true });
      }

      let notes = world.memoryNotes.filter((n) => !n.erased);
      if (!includeStale) notes = notes.filter((n) => !n.stale);

      // ACL: personal notes only for owner; group ACL
      notes = notes.filter((n) => {
        if (n.personal) return n.owner === actor;
        if (!person) return !n.personal;
        if (n.acl.includes("owner") && person.role === "owner") return true;
        if (n.acl.some((a) => person.groups.includes(a) || a === person.name)) return true;
        return n.owner === actor;
      });

      if (filter.includes("Contract.counterparty") && filter.includes("Northwind")) {
        notes = notes.filter(
          (n) =>
            n.fields.counterparty?.includes("Northwind") ||
            n.body.includes("Northwind"),
        );
      }
      if (filter.includes("governing_law")) {
        return NextResponse.json({
          results: notes
            .filter((n) => n.fields.governing_law)
            .map((n) => ({
              id: n.id,
              title: n.title,
              body: redactPii(n.body).text,
              note: "field exists only since Mar 2025",
              since: "2025-03-01",
            })),
          fieldSince: "2025-03-01",
        });
      }

      if (q) {
        notes = notes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.body.toLowerCase().includes(q) ||
            JSON.stringify(n.fields).toLowerCase().includes(q),
        );
      }

      // Never return erased subject plaintext
      const results = notes.map((n) => {
        const { text } = redactPii(n.body);
        return {
          id: n.id,
          title: n.title,
          body: text,
          owner: n.owner,
          personal: n.personal,
          stale: n.stale,
          fields: n.fields,
        };
      });

      return NextResponse.json({
        results,
        schema: world.schemaFields,
        ask:
          q.includes("renew") || q.includes("q4")
            ? {
                answer: "Northwind Partners renews before end of Q4",
                sources: results.filter((r) => r.body.includes("Northwind")).map((r) => r.id),
              }
            : undefined,
      });
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
            action?: "search" | "erase-note" | "export-audit";
            q?: string;
            noteId?: string;
            actor?: string;
          }>,
        catch: () => ({}),
      })) as { action?: string; q?: string; noteId?: string; actor?: string };

      if (body.action === "export-audit") {
        const entries = world.audit.map((e) => {
          const meta = { ...e.meta };
          // After erase, only hashed subject refs
          if (e.action.startsWith("erasure") || meta.subjectHash) {
            return {
              id: e.id,
              action: e.action,
              outcome: e.outcome,
              subjectHash: meta.subjectHash,
              actor: e.actor,
            };
          }
          return { id: e.id, action: e.action, outcome: e.outcome, actor: e.actor, meta };
        });
        const blob = JSON.stringify(entries);
        const hasName = /Jane Okafor|jane\.okafor/i.test(blob);
        return NextResponse.json({
          export: entries,
          hasPlaintextSubject: hasName,
          ok: !hasName || world.erasedSubjects.length === 0,
        });
      }

      if (body.action === "erase-note") {
        const note = world.memoryNotes.find((n) => n.id === body.noteId);
        if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
        note.erased = true;
        note.body = "[erased]";
        note.history = ["[erased]"];
        appendAudit(body.actor ?? "Dana Reyes", "memory.erase_note", "Note unreadable", {
          noteId: note.id,
        });
        return NextResponse.json({ ok: true });
      }

      // Default search via key — GW-07 memory access
      if (key && !key.canUse.includes("memory")) {
        appendAudit(key.name, "memory.access", "Refused — key can't use memory");
        return NextResponse.json(
          { error: "key cannot use memory", canUseMemory: false },
          { status: 403 },
        );
      }

      const q = (body.q ?? "").toLowerCase();
      if (world.erasedSubjects.some((s) => s.toLowerCase().includes(q))) {
        return NextResponse.json({ results: [] });
      }
      const results = world.memoryNotes
        .filter((n) => !n.erased && !n.personal)
        .filter((n) => !q || n.body.toLowerCase().includes(q) || n.title.toLowerCase().includes(q))
        .map((n) => ({ id: n.id, title: n.title, body: redactPii(n.body).text }));
      return NextResponse.json({ results, ids: results.map((r) => r.id) });
    }),
  );
}

export async function DELETE(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const url = new URL(req.url);
      const noteId = url.searchParams.get("id") ?? newId("mem");
      const note = getWorld().memoryNotes.find((n) => n.id === noteId);
      if (note) {
        note.erased = true;
        note.body = "[erased]";
        note.history = ["[erased]"];
      }
      return NextResponse.json({ ok: true });
    }),
  );
}
