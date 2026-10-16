import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text as RnText, TextInput, View } from "react-native";

import type { TeamBundle, Teammate } from "@/src/domain/schemas";
import { getTeamBundleEffect, inviteTeammateEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  IconBubble,
  LoadingBlock,
  Meta,
  PrimaryButton,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Subtitle,
  SurfaceCard,
} from "@/src/ui/primitives";

type Tab = "people" | "roles" | "groups";

function CheckRow({
  testID,
  label,
  checked,
  onToggle,
}: {
  testID: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: checked ? brand.seed : brand.border,
          backgroundColor: checked ? brand.seed : brand.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <RnText style={{ color: brand.surface, fontSize: 12, lineHeight: 14 }}>✓</RnText>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Body>{label}</Body>
      </View>
    </Pressable>
  );
}

export default function TeammatesScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [bundle, setBundle] = useState<TeamBundle | null>(null);
  const [tab, setTab] = useState<Tab>("people");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Member");
  const [acceptCanApprove, setAcceptCanApprove] = useState(false);
  const [acceptSecurityKeys, setAcceptSecurityKeys] = useState(false);
  const [acceptAuditRecorded, setAcceptAuditRecorded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setBundle(await Effect.runPromise(getTeamBundleEffect(session)));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || loading || !bundle) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  const people = bundle.people;
  const approvers = people.filter((p) => p.canApprove).length;
  const keysMissing = people.filter((p) => p.canApprove && !p.keysReady).length;
  const pending = people.filter((p) => p.invitePending).length;

  const invite = () => {
    setBusy(true);
    setNote(null);
    void Effect.runPromise(
      inviteTeammateEffect({
        session,
        email,
        name: name || undefined,
        role,
        acceptCanApprove,
        acceptSecurityKeys,
        acceptAuditRecorded,
      })
    )
      .then(async (person: Teammate) => {
        setNote(`Invite sent to ${person.email}`);
        setEmail("");
        setName("");
        setAcceptCanApprove(false);
        setAcceptSecurityKeys(false);
        setAcceptAuditRecorded(false);
        await load();
      })
      .catch((e: unknown) => {
        const reason =
          e && typeof e === "object" && "reason" in e
            ? String((e as { reason: string }).reason)
            : e instanceof Error
              ? e.message
              : String(e);
        setNote(reason);
      })
      .finally(() => setBusy(false));
  };

  return (
    <ScreenScroll
      testID="teammates-screen"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await load();
        } finally {
          setRefreshing(false);
        }
      }}
    >
      <SectionHeader
        icon="people"
        title="Team"
        subtitle="People, roles, and groups — invite from this phone with the same acceptance checks as the console."
      />
      <Meta color={brand.inkMuted}>
        {`${approvers} approvers · ${people.length} people${pending ? ` · ${pending} invited` : ""}`}
      </Meta>
      <Meta testID="teammates-no-view-as" color={brand.inkFaint}>
        Support “View as” is not available on mobile — use Team on the cloud
        console (Owner/Admin). Every start/stop is audited.
      </Meta>
      {keysMissing > 0 ? (
        <Column spacing={4} testID="teammates-keys-missing">
          <Badge label={`${keysMissing} missing keys`} tone="warn" />
          <Body color={brand.inkMuted}>
            Approvers without two security keys that can approve will fail NFC / key checks.
          </Body>
        </Column>
      ) : null}

      <Column spacing={space.sm} testID="teammates-tabs">
        {(
          [
            ["people", "People"],
            ["roles", "Roles"],
            ["groups", "Groups"],
          ] as const
        ).map(([id, label]) => (
          <SecondaryButton
            key={id}
            testID={`teammates-tab-${id}`}
            label={tab === id ? `· ${label}` : label}
            onPress={() => setTab(id)}
          />
        ))}
      </Column>

      {tab === "people" ? (
        <>
          <SurfaceCard testID="teammates-invite" tint="soft">
            <Subtitle>Invite people</Subtitle>
            <Meta>Acceptance checkboxes are required before the invite sends.</Meta>
            <TextInput
              testID="teammates-invite-email"
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={brand.inkFaint}
              autoCapitalize="none"
              keyboardType="email-address"
              accessibilityLabel="Invite email"
              style={{
                marginTop: space.sm,
                padding: space.md,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: brand.border,
                color: brand.ink,
                backgroundColor: brand.surface,
                minHeight: 48,
              }}
            />
            <TextInput
              testID="teammates-invite-name"
              value={name}
              onChangeText={setName}
              placeholder="Name (optional)"
              placeholderTextColor={brand.inkFaint}
              accessibilityLabel="Invite name"
              style={{
                marginTop: space.sm,
                padding: space.md,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: brand.border,
                color: brand.ink,
                backgroundColor: brand.surface,
                minHeight: 48,
              }}
            />
            <TextInput
              testID="teammates-invite-role"
              value={role}
              onChangeText={setRole}
              placeholder="Role"
              placeholderTextColor={brand.inkFaint}
              accessibilityLabel="Invite role"
              style={{
                marginTop: space.sm,
                padding: space.md,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: brand.border,
                color: brand.ink,
                backgroundColor: brand.surface,
                minHeight: 48,
              }}
            />
            <Column spacing={2} testID="teammates-invite-checks">
              <CheckRow
                testID="teammates-accept-approve"
                label="I understand approval areas are set per rule, not by role alone"
                checked={acceptCanApprove}
                onToggle={() => setAcceptCanApprove((v) => !v)}
              />
              <CheckRow
                testID="teammates-accept-keys"
                label="Invitee must register two security keys before approving"
                checked={acceptSecurityKeys}
                onToggle={() => setAcceptSecurityKeys((v) => !v)}
              />
              <CheckRow
                testID="teammates-accept-audit"
                label="This invite is recorded in the audit log"
                checked={acceptAuditRecorded}
                onToggle={() => setAcceptAuditRecorded((v) => !v)}
              />
            </Column>
            <PrimaryButton
              testID="teammates-invite-send"
              label={busy ? "Sending…" : "Send invite"}
              disabled={
                busy ||
                !email.trim() ||
                !acceptCanApprove ||
                !acceptSecurityKeys ||
                !acceptAuditRecorded
              }
              onPress={invite}
            />
            {note ? (
              <Meta testID="teammates-invite-note" color={brand.inkMuted}>
                {note}
              </Meta>
            ) : null}
          </SurfaceCard>

          <Column spacing={space.sm}>
            {people.map((person) => (
              <SurfaceCard key={person.id} testID={`teammate-${person.id}`}>
                <Column spacing={space.sm}>
                  <IconBubble
                    name={person.canApprove ? "key" : "people"}
                    tone="seed"
                    size={36}
                    iconSize={18}
                  />
                  <Subtitle>{person.name}</Subtitle>
                  <Meta>{`${person.email} · ${person.role}`}</Meta>
                  <Badge
                    label={
                      person.invitePending
                        ? "Invite pending"
                        : person.canApprove
                          ? person.keysReady
                            ? "Can approve"
                            : "Keys incomplete"
                          : "Requester"
                    }
                    tone={
                      person.invitePending
                        ? "neutral"
                        : person.canApprove
                          ? person.keysReady
                            ? "ok"
                            : "warn"
                          : "neutral"
                    }
                  />
                  <Meta>{person.groups.join(" · ")}</Meta>
                  <Meta color={brand.inkFaint}>{person.lastActive}</Meta>
                </Column>
              </SurfaceCard>
            ))}
          </Column>
        </>
      ) : null}

      {tab === "roles" ? (
        <Column spacing={space.sm} testID="teammates-roles">
          {bundle.roles.map((r) => (
            <SurfaceCard key={r.id} testID={`team-role-${r.id}`}>
              <Subtitle>{r.name}</Subtitle>
              <Meta>{r.people}</Meta>
              <Meta>{`Console ${r.console} · Connections ${r.connections}`}</Meta>
              <Meta>{`Policies ${r.policies} · People ${r.peopleManage}`}</Meta>
              <Meta>{`Audit export ${r.exportAudit} · Billing ${r.billing}`}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      ) : null}

      {tab === "groups" ? (
        <Column spacing={space.sm} testID="teammates-groups">
          {bundle.groups.map((g) => (
            <SurfaceCard key={g.id} testID={`team-group-${g.id}`}>
              <Subtitle>{g.name}</Subtitle>
              <Meta>{`${g.people} · grants ${g.role}`}</Meta>
              <Meta color={brand.inkFaint}>{g.usedIn}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      ) : null}

      <SecondaryButton label="Back to Profile" onPress={() => router.replace("/(tabs)/profile")} />
    </ScreenScroll>
  );
}
