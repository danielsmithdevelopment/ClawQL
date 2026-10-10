import { Effect } from "effect";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import type { ReviewItem } from "@/src/domain/schemas";
import { decideReviewEffect, listReviewEffect } from "@/src/services/api";
import { approveWithSecurityKeyEffect } from "@/src/services/nfc-security-key";
import { useSession } from "@/src/state/SessionContext";
import { colors, space } from "@/src/theme";
import {
  Badge,
  Body,
  Card,
  LoadingBlock,
  Meta,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Subtitle,
  Title,
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

  const load = useCallback(async () => {
    if (!session || !id) return;
    try {
      const res = await Effect.runPromise(listReviewEffect(session));
      setItem(res.items.find((i) => i.id === id) ?? null);
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (decision: "approve" | "decline") => {
    if (!session || !item) return;
    if (item.kind !== "change" && item.kind !== "source") {
      setError("This review kind is fixture-only until its backend lands.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      let approvalProof:
        | { method: "nfc_security_key" | "device_biometric_reviewer_demo"; attestation?: string }
        | undefined;
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
          setNote("Approved via reviewer-demo biometrics (audit-tagged).");
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
      setNote((prev) => prev ?? `${decision === "approve" ? "Approved" : "Declined"} · ${res.status}`);
      setTimeout(() => router.replace("/(tabs)/review"), 600);
    } catch (e: unknown) {
      const reason =
        e && typeof e === "object" && "reason" in e
          ? String((e as { reason: string }).reason)
          : e instanceof Error
            ? e.message
            : String(e);
      setError(reason);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen testID="review-detail-missing">
        <Title>Request not found</Title>
        <Meta style={{ marginTop: space.sm }}>It may have expired or already been decided.</Meta>
        <View style={{ height: space.md }} />
        <SecondaryButton label="Back to queue" onPress={() => router.replace("/(tabs)/review")} />
      </Screen>
    );
  }

  return (
    <Screen testID="review-detail-screen">
      <ScrollView>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Meta>{item.kindLabel}</Meta>
          <Badge label={item.badge} tone={item.badgeTone} />
        </View>
        <Title accessibilityRole="header" style={{ marginTop: 8 }}>
          {item.title}
        </Title>
        <Meta style={{ marginTop: 6 }}>{item.listMeta}</Meta>
        <Meta style={{ marginTop: 4 }}>{item.statusLine}</Meta>

        {item.exactChange && item.exactChange.length > 0 ? (
          <Card testID="exact-change" style={{ marginTop: space.md }}>
            <Subtitle>The exact change</Subtitle>
            <View style={{ marginTop: space.sm }}>
              <View style={{ flexDirection: "row", marginBottom: 4 }}>
                <Meta style={{ flex: 1, fontWeight: "700" }}>Field</Meta>
                <Meta style={{ flex: 1, fontWeight: "700" }}>Now</Meta>
                <Meta style={{ flex: 1, fontWeight: "700" }}>After</Meta>
              </View>
              {item.exactChange.map((row) => (
                <View
                  key={row.field}
                  style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <Body style={{ flex: 1, fontSize: 13 }}>{row.field}</Body>
                  <Body style={{ flex: 1, fontSize: 13 }}>{row.now}</Body>
                  <Body style={{ flex: 1, fontSize: 13, fontWeight: "600" }}>{row.after}</Body>
                </View>
              ))}
            </View>
            {item.digest ? (
              <Meta style={{ marginTop: space.sm, fontFamily: "SpaceMono" }}>
                {item.operationId ?? "operation"} · digest {item.digest}
              </Meta>
            ) : null}
          </Card>
        ) : (
          <Card style={{ marginTop: space.md }}>
            <Body>
              Approving resumes the parked execution; declining rejects it. Two-party rules still apply on the
              gateway.
            </Body>
          </Card>
        )}

        <Card>
          <Subtitle>Checks</Subtitle>
          <Meta style={{ marginTop: 6 }}>Panguard: no known attack patterns</Meta>
          <Meta>Policy: 1 approver with a security key, never the requester</Meta>
          {session?.reviewerDemo ? (
            <Meta style={{ marginTop: 6, color: colors.warn }}>
              Reviewer demo: approve with device biometrics (audit-tagged).
            </Meta>
          ) : (
            <Meta style={{ marginTop: 6 }}>
              Production: tap your YubiKey to this phone (NFC) to approve.
            </Meta>
          )}
        </Card>

        <View style={{ gap: space.sm, marginBottom: space.xl }}>
          <PrimaryButton
            testID="review-approve"
            label={busy ? "Working…" : "Approve with security key"}
            disabled={busy}
            onPress={() => void decide("approve")}
          />
          <SecondaryButton
            testID="review-decline"
            label="Decline"
            disabled={busy}
            onPress={() => void decide("decline")}
          />
        </View>

        {note ? (
          <Meta testID="review-note" style={{ color: colors.ok, marginBottom: space.md }}>
            {note}
          </Meta>
        ) : null}
        {error ? (
          <Meta testID="review-error" style={{ color: colors.danger, marginBottom: space.md }}>
            {error}
          </Meta>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
