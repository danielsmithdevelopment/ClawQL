import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, newId } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      const body = (yield* Effect.tryPromise({
        try: () =>
          req.json() as Promise<{
            subject?: string;
            actor?: string;
            pinVerified?: boolean;
            resumeJobId?: string;
            stopHalfway?: boolean;
          }>,
        catch: () => ({}),
      })) as {
        subject?: string;
        actor?: string;
        pinVerified?: boolean;
        resumeJobId?: string;
        stopHalfway?: boolean;
      };

      if (body.resumeJobId) {
        const job = world.eraseJobs.find((j) => j.id === body.resumeJobId);
        if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
        const already = new Set(job.steps);
        while (job.done < job.total) {
          job.done += 1;
          const step = `step_${job.done}`;
          if (!already.has(step)) job.steps.push(step);
        }
        job.certificateReady = true;
        job.stopped = false;
        appendAudit(body.actor ?? "Dana Reyes", "erasure.resume", "Completed", {
          jobId: body.resumeJobId,
        });
        return NextResponse.json({ ok: true, job });
      }

      if (body.pinVerified === false) {
        return NextResponse.json({ error: "security key required" }, { status: 403 });
      }
      const subject = body.subject ?? "Jane Okafor";
      const jobId = newId("era");
      const job = {
        id: jobId,
        subject,
        done: body.stopHalfway ? 3 : 7,
        total: 7,
        steps: body.stopHalfway
          ? ["notes", "indexes", "fields"]
          : ["notes", "indexes", "fields", "doc", "exports", "sessions", "final"],
        certificateReady: !body.stopHalfway,
        stopped: Boolean(body.stopHalfway),
      };
      world.eraseJobs.push(job);
      if (!body.stopHalfway) {
        world.erasedSubjects.push(subject);
        for (const d of world.documents) {
          if (JSON.stringify(d).includes(subject.split(" ")[0]!)) {
            d.fields = { text: "[erased]" };
            d.status = "Erased";
          }
        }
        for (const n of world.memoryNotes) {
          if (n.body.includes(subject) || n.body.toLowerCase().includes("jane")) {
            n.erased = true;
            n.body = "[erased]";
            n.history = ["[erased]"];
          }
        }
        for (const exp of world.trainingExports) {
          if (exp.subjects.includes(subject)) exp.needsRegenerate = true;
        }
        appendAudit(body.actor ?? "Dana Reyes", "erasure.complete", "Certificate ready", {
          jobId,
          subjectHash: Buffer.from(subject).toString("base64url").slice(0, 12),
        });
      }
      return NextResponse.json({ ok: true, jobId, job });
    }),
  );
}

export async function GET(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const url = new URL(req.url);
      const q = url.searchParams.get("q") ?? "";
      const erased = getWorld().erasedSubjects.some((s) =>
        s.toLowerCase().includes(q.toLowerCase()),
      );
      if (erased) {
        return NextResponse.json({ results: [], found: false });
      }
      return NextResponse.json({
        results: getWorld().documents.filter((d) =>
          JSON.stringify(d).toLowerCase().includes(q.toLowerCase()),
        ),
        found: true,
      });
    }),
  );
}
