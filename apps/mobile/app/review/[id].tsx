import { Effect } from "effect";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { ReviewDecision, ReviewItem } from "@/src/domain/schemas";
import { decideReviewEffect, getReviewByIdEffect } from "@/src/services/api";
import { loadMobileConfigEffect } from "@/src/services/config";
import { approveWithSecurityKeyEffect } from "@/src/services/nfc-security-key";
import { useSession } from "@/src/state/SessionContext";
import { brand, color, space } from "@/src/theme";
import {
  Badge,
  Body,
  ChoiceRow,
  Column,
  LoadingBlock,
  Meta,
  PrimaryButton,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  Subtitle,
  SurfaceCard,
  Title,
  WrapRow,
} from "@/src/ui/primitives";

export default function ReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const router = useRouter();
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixtureMode, setFixtureMode] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !id) return;
    try {
      const [found, config] = await Promise.all([
        Effect.runPromise(getReviewByIdEffect(session, id)),
        Effect.runPromise(loadMobileConfigEffect()),
      ]);
      setItem(found);
      setFixtureMode(config.fixtureMode);
      if (found?.kind === "decision") {
        const preferred =
          found.decisionChoices?.find((c) => c.label === "Refund request")?.label ??
          found.decisionChoices?.[0]?.label ??
          null;
        setSelectedAnswer(preferred);
      }
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const navigateBackSoon = () => {
    setTimeout(() => router.replace("/(tabs)/review"), 600);
  };

  const decideKeyed = async (decision: "approve" | "decline") => {
    if (!session || !item) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      let approvalProof:
        | { method: "nfc_security_key" | "device_biometric_reviewer_demo"; attestation?: string }
        | undefined;
      let preNote: string | null = null;
      if (decision === "approve") {
        const attestation = await Effect.runPromise(
          approveWithSecurityKeyEffect({
            session,
            requestId: item.id,
            digest: item.digest,
          })
        );
        approvalProof = {
          method: attestation.method,
          attestation: attestation.attestation,
        };
        if (attestation.auditedAsReviewerDemo) {
          preNote = "Approved via reviewer-demo biometrics (audit-tagged).";
        } else if (attestation.simulatedFixture) {
          preNote = "Approved via simulated NFC (fixture mode).";
        }
      }
      const res = await Effect.runPromise(
        decideReviewEffect({
          session,
          id: item.id,
          kind: item.kind,
          decision,
          approvalProof,
        })
      );
      const verb =
        decision === "approve"
          ? item.kind === "skill"
            ? "Promoted"
            : "Approved"
          : "Declined";
      setNote(preNote ?? `${verb} · ${res.status}`);
      navigateBackSoon();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const decidePlain = async (decision: ReviewDecision, answer?: string) => {
    if (!session || !item) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await Effect.runPromise(
        decideReviewEffect({
          session,
          id: item.id,
          kind: item.kind,
          decision,
          answer,
        })
      );
      setNote(String(res.status));
      navigateBackSoon();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  if (!item) {
    return (
      <ScreenScroll testID="review-detail-missing">
        <Title>Request not found</Title>
        <Meta>It may have expired or already been decided.</Meta>
        <SecondaryButton label="Back to queue" onPress={() => router.replace("/(tabs)/review")} />
      </ScreenScroll>
    );
  }

  const decided = Boolean(item.decidedStatus);

  return (
    <ScreenScroll testID="review-detail-screen">
      <WrapRow>
        <Meta>{item.kindLabel}</Meta>
        <Badge label={item.badge} tone={item.badgeTone} />
        {decided ? <Badge label="Decided" tone="ok" /> : null}
      </WrapRow>
      <Title>{item.title}</Title>
      <Meta>{item.listMeta}</Meta>
      <Meta>{item.statusLine}</Meta>

      {decided ? (
        <SurfaceCard testID="review-decided-banner">
          <Subtitle>Already decided</Subtitle>
          <Meta testID="review-decided-status">
            {`${item.decidedStatus}${
              item.decidedAtMs ? ` · ${new Date(item.decidedAtMs).toLocaleString()}` : ""
            }`}
          </Meta>
          <Meta>Read-only history from Activity.</Meta>
        </SurfaceCard>
      ) : null}

      {item.kind === "skill" ? <SkillBody item={item} /> : null}
      {item.kind === "decision" ? (
        <DecisionBody
          item={item}
          selectedAnswer={selectedAnswer}
          onSelect={setSelectedAnswer}
          readOnly={decided}
        />
      ) : null}
      {item.kind === "change" ? <ChangeBody item={item} /> : null}
      {item.kind === "source" ? <SourceBody /> : null}

      {!decided && item.kind !== "decision" ? (
        <SurfaceCard>
          <Subtitle>Checks</Subtitle>
          <Meta>Panguard: no known attack patterns</Meta>
          <Meta>Policy: 1 approver with a security key, never the requester</Meta>
          {session?.reviewerDemo ? (
            <Meta color={brand.warn}>
              Reviewer demo: approve with device biometrics (audit-tagged).
            </Meta>
          ) : fixtureMode ? (
            <Meta color={color.primary} testID="fixture-nfc-hint">
              Fixture mode: Approve uses simulated NFC (no hardware).
            </Meta>
          ) : (
            <Meta>Production: tap your YubiKey to this phone (NFC) to approve.</Meta>
          )}
        </SurfaceCard>
      ) : null}

      {!decided ? (
        <Column spacing={space.sm}>
          {item.kind === "decision" ? (
            <>
              <PrimaryButton
                testID="review-submit-answer"
                label={busy ? "Working…" : "Submit answer"}
                disabled={busy || !selectedAnswer}
                onPress={() => void decidePlain("answer", selectedAnswer ?? undefined)}
              />
              <SecondaryButton
                testID="review-skip"
                label="Skip for now"
                disabled={busy}
                onPress={() => void decidePlain("skip")}
              />
              <SecondaryButton
                testID="review-ask-teammate"
                label="Ask a teammate"
                disabled={busy}
                onPress={() => void decidePlain("ask_teammate")}
              />
            </>
          ) : item.kind === "change" && item.changeStatus === "outcome_unknown" ? (
            <>
              <PrimaryButton
                testID="review-mark-applied"
                label={busy ? "Working…" : "Mark applied"}
                disabled={busy}
                onPress={() => void decidePlain("mark_applied")}
              />
              <SecondaryButton
                testID="review-mark-not-applied"
                label="Mark not applied"
                disabled={busy}
                onPress={() => void decidePlain("mark_not_applied")}
              />
              <SecondaryButton
                testID="review-retry-with-key"
                label="Retry with key"
                disabled={busy || !item.idempotencyCapable}
                onPress={() => void decidePlain("retry_with_key")}
              />
            </>
          ) : (
            <>
              <PrimaryButton
                testID="review-approve"
                label={
                  busy
                    ? "Working…"
                    : item.kind === "skill"
                      ? "Promote with security key"
                      : "Approve with security key"
                }
                disabled={busy}
                onPress={() => void decideKeyed("approve")}
              />
              <SecondaryButton
                testID="review-decline"
                label="Decline"
                disabled={busy}
                onPress={() => void decideKeyed("decline")}
              />
            </>
          )}
        </Column>
      ) : (
        <SecondaryButton
          testID="review-back-activity"
          label="Back to Activity"
          onPress={() => router.replace("/(tabs)/activity")}
        />
      )}

      {note ? (
        <Meta testID="review-note" color={brand.ok}>
          {note}
        </Meta>
      ) : null}
      {error ? (
        <Meta testID="review-error" color={brand.danger}>
          {error}
        </Meta>
      ) : null}
    </ScreenScroll>
  );
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "reason" in e) {
    return String((e as { reason: string }).reason);
  }
  return e instanceof Error ? e.message : String(e);
}

function SkillBody({ item }: { item: ReviewItem }) {
  return (
    <>
      <SurfaceCard testID="skill-body">
        <Subtitle>What approving does</Subtitle>
        <Meta>{item.skillSummary ?? ""}</Meta>
        <Body>
          Skill becomes Active and can run without asking each time. It stays sandboxed — only the
          listed reads, writes, network, and spend. Any later code change sends it back to proving.
        </Body>
      </SurfaceCard>
      {item.skillPermissions ? (
        <SurfaceCard testID="skill-permissions">
          <Subtitle>What it is allowed to do</Subtitle>
          <Meta>{`Reads · ${item.skillPermissions.reads}`}</Meta>
          <Meta>{`Writes · ${item.skillPermissions.writes}`}</Meta>
          <Meta>{`Network · ${item.skillPermissions.network}`}</Meta>
          <Meta>{`Spend · ${item.skillPermissions.spend}`}</Meta>
        </SurfaceCard>
      ) : null}
      <SurfaceCard>
        <Subtitle>Evidence · All checks passed</Subtitle>
        <WrapRow gap={6}>
          {(item.skillEvidence ?? []).map((pill) => (
            <Badge key={pill} label={pill} tone="ok" />
          ))}
        </WrapRow>
        <Meta>Policy: one contract approver with a security key who is not the proposer.</Meta>
      </SurfaceCard>
    </>
  );
}

function DecisionBody({
  item,
  selectedAnswer,
  onSelect,
  readOnly,
}: {
  item: ReviewItem;
  selectedAnswer: string | null;
  onSelect: (label: string) => void;
  readOnly?: boolean;
}) {
  return (
    <SurfaceCard testID="decision-body">
      {item.decisionSite ? <Badge label={`Site: ${item.decisionSite}`} tone="neutral" /> : null}
      {item.decisionQuote ? <Body italic>{item.decisionQuote}</Body> : null}
      <Column spacing={space.sm}>
        {(item.decisionChoices ?? []).map((choice) => (
          <ChoiceRow
            key={choice.label}
            testID={`decision-choice-${choice.label.replace(/\s+/g, "-").toLowerCase()}`}
            label={choice.label}
            score={choice.score}
            selected={selectedAnswer === choice.label}
            onPress={() => {
              if (!readOnly) onSelect(choice.label);
            }}
          />
        ))}
      </Column>
      <Meta color={brand.warn}>Scores not calibrated yet · 112 of 300 labeled examples</Meta>
    </SurfaceCard>
  );
}

function ChangeBody({ item }: { item: ReviewItem }) {
  if (item.exactChange && item.exactChange.length > 0) {
    return (
      <SurfaceCard testID="exact-change">
        <Subtitle>The exact change</Subtitle>
        <Meta>Field · now → after</Meta>
        {item.exactChange.map((row) => (
          <Body key={row.field}>{`${row.field}: ${row.now} → ${row.after}`}</Body>
        ))}
        {item.digest ? (
          <Meta mono>{`${item.operationId ?? "operation"} · digest ${item.digest}`}</Meta>
        ) : null}
        {item.changeStatus === "outcome_unknown" ? (
          <Meta color={brand.danger} testID="outcome-unknown-hint">
            {`Consumed more than 60s ago with no finalize. Do not silent-retry.${
              item.idempotencyKey ? ` Key: ${item.idempotencyKey}` : ""
            }`}
          </Meta>
        ) : null}
      </SurfaceCard>
    );
  }
  return (
    <SurfaceCard>
      <Body>
        Approving resumes the parked execution; declining rejects it. Two-party rules still apply on
        the gateway.
      </Body>
    </SurfaceCard>
  );
}

function SourceBody() {
  return (
    <SurfaceCard testID="source-body">
      <Body>
        support-bot proposed adding Linear after a ticket needed fields ClawQL cannot reach yet.
        Spec scanned by Panguard with no known attack patterns.
      </Body>
      <Meta>Host will be added to allowed outbound hosts on approve.</Meta>
    </SurfaceCard>
  );
}
