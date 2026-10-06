import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, newId, personByName } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      return NextResponse.json({
        keys: world.keys.map((k) => ({
          ...k,
          secretOnce: undefined,
          secretShown: k.secretShown,
          lastFour: k.lastFour,
          canUseMemory: k.canUse.includes("memory"),
          capReached: k.spentTodayCents >= k.dailyCapCents,
        })),
        people: world.people.map((p) => ({
          name: p.name,
          role: p.role,
          keyCount: p.securityKeys.filter((k) => !k.revoked).length,
          needsTwo: p.securityKeys.filter((k) => !k.revoked && k.canApprove).length < 2,
          keys: p.securityKeys.map((k) => ({
            id: k.id,
            label: k.label,
            kind: k.kind,
            canApprove: k.canApprove,
            status: k.canApprove ? "Can approve" : "Sign-in only",
          })),
        })),
        firstRun: {
          step: world.firstRunStep,
          total: world.firstRunTotal,
          securityKeysRegistered: world.securityKeysRegistered,
          step3Unlocked: world.securityKeysRegistered,
        },
        recoveryCodesRemaining: world.recoveryCodes.length,
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
      const body = (yield* Effect.tryPromise({
        try: () =>
          req.json() as Promise<{
            action?: "create" | "revoke" | "issue" | "register" | "remove" | "remind" | "confirmSaved";
            name?: string;
            group?: string;
            canUse?: string[];
            actor?: string;
            pinVerified?: boolean;
            userVerification?: boolean;
            keyKind?: "device-bound" | "synced" | "totp";
            person?: string;
            keyId?: string;
            aaguid?: string;
          }>,
        catch: () => ({}),
      })) as {
        action?: string;
        name?: string;
        group?: string;
        canUse?: string[];
        actor?: string;
        pinVerified?: boolean;
        userVerification?: boolean;
        keyKind?: "device-bound" | "synced" | "totp";
        person?: string;
        keyId?: string;
        aaguid?: string;
      };

      const action = body.action ?? "issue";

      if (action === "register") {
        const person = personByName(body.person ?? body.actor ?? "Dana Reyes");
        if (!person) return NextResponse.json({ error: "person not found" }, { status: 404 });
        const kind = body.keyKind ?? "device-bound";
        const key = {
          id: newId("sk"),
          label: body.name ?? `${kind} key`,
          kind,
          canApprove: kind === "device-bound",
          aaguid: body.aaguid ?? "aagu_yubi5",
          signatureCounter: 1,
          revoked: false,
        };
        person.securityKeys.push(key);
        if (person.securityKeys.filter((k) => !k.revoked).length >= 2) {
          world.securityKeysRegistered = true;
          world.recoveryCodesShownOnce = true;
          world.firstRunStep = Math.max(world.firstRunStep, 3);
        }
        appendAudit(person.name, "security_key.register", kind === "device-bound" ? "Can approve" : "Sign-in only");
        return NextResponse.json({
          ok: true,
          key,
          status: key.canApprove ? "Can approve" : "Sign-in only",
          recoveryCodes: world.recoveryCodesShownOnce ? world.recoveryCodes : undefined,
        });
      }

      if (action === "remove") {
        const person = personByName(body.person ?? "Dana Reyes");
        if (!person) return NextResponse.json({ error: "person not found" }, { status: 404 });
        const active = person.securityKeys.filter((k) => !k.revoked);
        if (active.length <= 2) {
          appendAudit(person.name, "security_key.remove", "Blocked — two-key rule");
          return NextResponse.json(
            { error: "Blocked — two-key rule", explanation: "You must keep at least two security keys" },
            { status: 403 },
          );
        }
        const target = person.securityKeys.find((k) => k.id === body.keyId) ?? active[0];
        if (target) target.revoked = true;
        return NextResponse.json({ ok: true });
      }

      if (action === "remind") {
        const person = personByName(body.person ?? "Marcus Lee");
        if (person) {
          world.notificationsOutbox.push({
            to: person.name,
            channel: "push",
            body: "needs 2 security keys",
          });
          appendAudit("Dana Reyes", "security_key.remind", "Reminded", { person: person.name });
          return NextResponse.json({
            ok: true,
            row: "needs 2",
            notified: true,
            keyCount: person.securityKeys.filter((k) => !k.revoked).length,
          });
        }
      }

      if (action === "revoke") {
        const key = world.keys.find((k) => k.name === body.name || k.id === body.name);
        if (!key) return NextResponse.json({ error: "not found" }, { status: 404 });
        key.revoked = true;
        appendAudit(body.actor ?? "Dana Reyes", "key.revoke", "Revoked", { key: key.name });
        return NextResponse.json({ ok: true, key: key.name });
      }

      if (action === "confirmSaved") {
        const key = world.keys.find((k) => k.name === body.name || k.id === body.name);
        if (!key) return NextResponse.json({ error: "not found" }, { status: 404 });
        key.confirmedSaved = true;
        key.secretShown = false;
        key.secretOnce = undefined;
        return NextResponse.json({ ok: true, lastFour: key.lastFour, doneEnabled: true });
      }

      // issue / create API key — requires UV
      if (!world.securityKeysRegistered && world.firstRunStep < 3) {
        return NextResponse.json(
          { error: "Step 3 disabled — needs your security keys" },
          { status: 403 },
        );
      }
      if (body.userVerification === false || body.pinVerified === false) {
        appendAudit(body.actor ?? "Dana Reyes", "key.issue", "Rejected — needs PIN or fingerprint");
        return NextResponse.json(
          { error: "Rejected for needing a PIN or fingerprint; no key is created" },
          { status: 403 },
        );
      }
      const lastFour = newId("").slice(-4);
      const secret = `cqk_${lastFour}_${newId("sec").slice(4)}`;
      const key = {
        id: newId("key"),
        name: body.name ?? `key-${lastFour}`,
        secretShown: true,
        group: body.group ?? "Engineering",
        canUse: body.canUse ?? ["models", "tools"],
        dailyCapCents: 5000,
        spentTodayCents: 0,
        revoked: false,
        expiresAt: new Date(Date.now() + 90 * 864e5).toISOString(),
        lastFour,
        secretOnce: secret,
        confirmedSaved: false,
      };
      world.keys.push(key);
      appendAudit(body.actor ?? "Dana Reyes", "key.issue", "Issued", { key: key.name });
      return NextResponse.json({
        ok: true,
        key: { ...key, secret },
        doneDisabled: true,
        message: "Secret shown once — confirm you saved it",
      });
    }),
  );
}
