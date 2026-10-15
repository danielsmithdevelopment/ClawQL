import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { TextInput } from "react-native";

import type { ApiKeyItem } from "@/src/domain/schemas";
import {
  issueApiKeyEffect,
  listApiKeysEffect,
  revokeApiKeyEffect,
} from "@/src/services/api";
import { copySecretEffect } from "@/src/services/secure-clipboard";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  LoadingBlock,
  Meta,
  PrimaryButton,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  SurfaceCard,
} from "@/src/ui/primitives";

export default function ApiKeysScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [keys, setKeys] = useState<readonly ApiKeyItem[]>([]);
  const [name, setName] = useState("phone-agent");
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!session) return;
    setKeys(await Effect.runPromise(listApiKeysEffect(session)));
  }, [session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="keys-screen">
      <SectionHeader
        icon="key"
        title="API keys"
        subtitle="Issue and revoke gateway API keys — same job as Connections → Keys in the cloud console."
      />

      <SurfaceCard testID="keys-create" tint="soft">
        <Body>Create key</Body>
        <TextInput
          testID="keys-name-input"
          value={name}
          onChangeText={setName}
          placeholder="Key name"
          placeholderTextColor={brand.inkFaint}
          accessibilityLabel="API key name"
          autoCapitalize="none"
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
        <PrimaryButton
          testID="keys-issue"
          label={busy ? "Issuing…" : "Issue key"}
          disabled={busy || !name.trim()}
          onPress={() => {
            setBusy(true);
            setNote(null);
            void Effect.runPromise(
              issueApiKeyEffect({ session, name, canUse: "Models, tools, memory" })
            )
              .then(async (out) => {
                setSecret(out.secret);
                setNote(`Issued ${out.key.name} · …${out.key.endsIn ?? ""}`);
                await reload();
              })
              .finally(() => setBusy(false));
          }}
        />
        {secret ? (
          <SurfaceCard testID="keys-secret" tint="seed">
            <Meta color={brand.inkFaint}>Secret shown once — copy it now.</Meta>
            <Meta testID="keys-secret-value" mono>
              {secret}
            </Meta>
            <SecondaryButton
              testID="keys-copy-secret"
              label="Copy secret (clears in 60s)"
              onPress={() => {
                void Effect.runPromise(copySecretEffect(secret)).then((out) =>
                  setNote(
                    out.copied
                      ? out.localOnly
                        ? `Secret copied (this device only) · expires in ${Math.round(out.clearedAfterMs / 1000)}s`
                        : `Secret copied · pasteboard clears in ${Math.round(out.clearedAfterMs / 1000)}s`
                      : "Copy unavailable — select the secret text"
                  )
                );
              }}
            />
          </SurfaceCard>
        ) : null}
      </SurfaceCard>

      <SurfaceCard testID="keys-list">
        <Body>Active keys</Body>
        <Column spacing={space.sm}>
          {keys.map((key) => (
            <SurfaceCard key={key.id} testID={`keys-row-${key.id}`} tint="soft">
              <Body>{key.name}</Body>
              <Meta color={brand.inkFaint}>{`${key.keyGroup} · ${key.canUse} · cap ${key.dailyCap}`}</Meta>
              <Meta color={brand.inkFaint}>{`Ends …${key.endsIn ?? "????"} · expires ${key.expiresLabel}`}</Meta>
              {key.capReached ? <Badge label="Cap reached" tone="warn" /> : null}
              <SecondaryButton
                testID={`keys-revoke-${key.id}`}
                label="Revoke"
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void Effect.runPromise(revokeApiKeyEffect({ session, keyId: key.id }))
                    .then(async () => {
                      setNote(`Revoked ${key.name}`);
                      if (secret?.includes(key.endsIn ?? "___never___")) setSecret(null);
                      await reload();
                    })
                    .finally(() => setBusy(false));
                }}
              />
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>

      {note ? (
        <Meta testID="keys-note" color={brand.ok}>
          {note}
        </Meta>
      ) : null}

      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
