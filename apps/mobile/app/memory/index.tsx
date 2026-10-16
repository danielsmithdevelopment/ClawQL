import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text as RnText, TextInput, View } from "react-native";

import type { MemoryResult, MemoryUpload } from "@/src/domain/schemas";
import {
  eraseMemorySubjectEffect,
  listMemoryUploadsEffect,
  searchMemoryEffect,
} from "@/src/services/api";
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
  Subtitle,
  SurfaceCard,
} from "@/src/ui/primitives";

const KINDS = ["all", "ENTITY", "DOCUMENT", "NOTE"] as const;
type Tab = "explore" | "pipelines" | "erase";

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

export default function MemoryExplorerScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("explore");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [rows, setRows] = useState<readonly MemoryResult[]>([]);
  const [uploads, setUploads] = useState<readonly MemoryUpload[]>([]);
  const [erasedSubjects, setErasedSubjects] = useState<readonly string[]>([]);
  const [subject, setSubject] = useState("Jane Okafor");
  const [acceptIrreversible, setAcceptIrreversible] = useState(false);
  const [acceptAuditKept, setAcceptAuditKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadExplore = useCallback(async () => {
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

  const loadUploads = useCallback(async () => {
    if (!session) return;
    const next = await Effect.runPromise(listMemoryUploadsEffect(session));
    setUploads(next.uploads);
    setErasedSubjects(next.erasedSubjects);
  }, [session]);

  useEffect(() => {
    void loadExplore();
  }, [loadExplore]);

  useEffect(() => {
    if (tab === "pipelines" || tab === "erase") {
      void loadUploads();
    }
  }, [loadUploads, tab]);

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
        title="Memory & documents"
        subtitle={`Search, pipelines, and subject erase — same jobs as the cloud console.${
          session.reviewerDemo ? " · reviewer demo" : ""
        }`}
      />
      {session.reviewerDemo ? (
        <SurfaceCard testID="memory-reviewer-demo" tint="soft">
          <Badge label="Reviewer demo · sample data" tone="warn" />
          <Meta color={brand.inkFaint}>
            Sample memory is labeled for App Review. Production builds show empty states when live
            data is unavailable.
          </Meta>
        </SurfaceCard>
      ) : null}

      <Column spacing={space.sm} testID="memory-tabs">
        {(
          [
            ["explore", "Explore"],
            ["pipelines", "Pipelines"],
            ["erase", "Erase"],
          ] as const
        ).map(([id, label]) => (
          <SecondaryButton
            key={id}
            testID={`memory-tab-${id}`}
            label={tab === id ? `· ${label}` : label}
            onPress={() => setTab(id)}
          />
        ))}
      </Column>

      {tab === "explore" ? (
        <>
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
                onPress={() => void loadExplore()}
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
                <SurfaceCard key={row.id} testID={`memory-row-${row.id}`} tint="soft">
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
        </>
      ) : null}

      {tab === "pipelines" ? (
        <SurfaceCard testID="memory-pipelines">
          <Subtitle>Document pipelines</Subtitle>
          <Column spacing={space.sm}>
            {uploads.map((row) => (
              <SurfaceCard key={row.id} testID={`memory-upload-${row.id}`} tint="soft">
                <Badge label={row.status} tone={row.tone} />
                <Body>{row.file}</Body>
                <Meta>{`${row.pipeline} · ${row.addedBy}`}</Meta>
                <Meta color={brand.inkFaint}>{`${row.meta} · ${row.added}`}</Meta>
              </SurfaceCard>
            ))}
          </Column>
        </SurfaceCard>
      ) : null}

      {tab === "erase" ? (
        <SurfaceCard testID="memory-erase" tint="soft">
          <Subtitle>Erase subject</Subtitle>
          <Meta>
            Removes personal data from memory stores. A hashed reference stays in the audit log.
          </Meta>
          <TextInput
            testID="memory-erase-subject"
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject name"
            placeholderTextColor={brand.inkFaint}
            accessibilityLabel="Erase subject"
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
          <Column spacing={2} testID="memory-erase-checks">
            <CheckRow
              testID="memory-erase-accept-irreversible"
              label="I understand this erase cannot be undone"
              checked={acceptIrreversible}
              onToggle={() => setAcceptIrreversible((v) => !v)}
            />
            <CheckRow
              testID="memory-erase-accept-audit"
              label="A hashed audit reference will be kept"
              checked={acceptAuditKept}
              onToggle={() => setAcceptAuditKept((v) => !v)}
            />
          </Column>
          <PrimaryButton
            testID="memory-erase-run"
            label={busy ? "Erasing…" : "Erase subject"}
            disabled={busy || !subject.trim() || !acceptIrreversible || !acceptAuditKept}
            onPress={() => {
              setBusy(true);
              setNote(null);
              void Effect.runPromise(
                eraseMemorySubjectEffect({
                  session,
                  subject,
                  acceptIrreversible,
                  acceptAuditKept,
                })
              )
                .then(async (out) => {
                  setNote(`Erased ${out.subject}`);
                  setAcceptIrreversible(false);
                  setAcceptAuditKept(false);
                  await loadUploads();
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
            }}
          />
          {note ? (
            <Meta testID="memory-erase-note" color={brand.inkMuted}>
              {note}
            </Meta>
          ) : null}
          {erasedSubjects.length > 0 ? (
            <Meta testID="memory-erased-list" color={brand.inkFaint}>
              {`Erased · ${erasedSubjects.join(", ")}`}
            </Meta>
          ) : null}
        </SurfaceCard>
      ) : null}

      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
