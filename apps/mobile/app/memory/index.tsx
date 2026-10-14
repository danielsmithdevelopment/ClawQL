import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { TextInput } from "react-native";

import type { MemoryResult } from "@/src/domain/schemas";
import { searchMemoryEffect } from "@/src/services/api";
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

const KINDS = ["all", "ENTITY", "DOCUMENT", "NOTE"] as const;

export default function MemoryExplorerScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [rows, setRows] = useState<readonly MemoryResult[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const next = await Effect.runPromise(
        searchMemoryEffect(session, query, kind === "all" ? "all" : kind)
      );
      setRows(next);
    } finally {
      setBusy(false);
    }
  }, [kind, query, session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="memory-screen">
      <SectionHeader
        icon="agents"
        title="Memory explorer"
        subtitle="Search entities, notes, and documents — same catalog as the cloud console."
      />

      <SurfaceCard testID="memory-search" tint="soft">
        <TextInput
          testID="memory-query"
          value={query}
          onChangeText={setQuery}
          placeholder="Search title or summary"
          placeholderTextColor={brand.inkFaint}
          accessibilityLabel="Memory search"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            padding: space.md,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: brand.border,
            color: brand.ink,
            backgroundColor: brand.surface,
            minHeight: 48,
          }}
        />
        <Column spacing={space.sm}>
          <PrimaryButton
            testID="memory-run-search"
            label={busy ? "Searching…" : "Search"}
            disabled={busy}
            onPress={() => void load()}
          />
          {KINDS.map((k) => (
            <SecondaryButton
              key={k}
              testID={`memory-kind-${k}`}
              label={k === "all" ? "All kinds" : k}
              disabled={busy || kind === k}
              onPress={() => setKind(k)}
            />
          ))}
        </Column>
      </SurfaceCard>

      <SurfaceCard testID="memory-results">
        <Meta testID="memory-count">{`${rows.length} result${rows.length === 1 ? "" : "s"}`}</Meta>
        <Column spacing={space.sm}>
          {rows.map((row) => (
            <SurfaceCard
              key={row.id}
              testID={`memory-row-${row.id}`}
              tint="soft"
            >
              <Badge label={row.badge} tone={row.badgeTone} />
              <Body>{row.title}</Body>
              <Meta color={brand.inkFaint}>{row.summary}</Meta>
              <SecondaryButton
                testID={`memory-open-${row.id}`}
                label="Open"
                onPress={() => router.push(`/memory/${row.id}`)}
              />
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>

      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
