import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/src/state/SessionContext";
import {
  listWorkflowRunsEffect,
  listWorkflowsEffect,
  startWorkflowEffect,
} from "@/src/services/api";
import type { WorkflowProgram, WorkflowRun } from "@/src/domain/schemas";
import { brand, space } from "@/src/theme";
import {
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

export default function WorkflowsScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [programs, setPrograms] = useState<readonly WorkflowProgram[]>([]);
  const [runs, setRuns] = useState<readonly WorkflowRun[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!session) return;
    const [list, history] = await Promise.all([
      Effect.runPromise(listWorkflowsEffect(session)),
      Effect.runPromise(listWorkflowRunsEffect(session)),
    ]);
    setPrograms(list);
    setRuns(history);
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
    <ScreenScroll testID="workflows-screen">
      <SectionHeader
        icon="agents"
        title="Workflows"
        subtitle="Start fixture programs by tap or voice (“start standup digest”)."
      />

      <SurfaceCard testID="workflows-catalog">
        <Column spacing={space.sm}>
          {programs.map((program) => (
            <SurfaceCard key={program.id} testID={`workflow-row-${program.id}`} tint="soft">
              <Body>{program.title}</Body>
              <Meta color={brand.inkFaint}>{`${program.stage} · ${program.summary}`}</Meta>
              <PrimaryButton
                testID={`workflow-start-${program.id}`}
                label={busy ? "Starting…" : "Start"}
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void Effect.runPromise(
                    startWorkflowEffect({ session, workflowId: program.id })
                  )
                    .then((run) => {
                      setNote(`Started ${run.name}`);
                      return reload();
                    })
                    .finally(() => setBusy(false));
                }}
              />
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>

      {runs.length > 0 ? (
        <SurfaceCard testID="workflows-runs">
          <Body>Recent runs</Body>
          {runs.slice(0, 5).map((run) => (
            <Meta
              key={run.id}
              testID={`workflow-run-${run.id}`}
              color={brand.inkFaint}
            >{`${run.name} · ${run.status}`}</Meta>
          ))}
        </SurfaceCard>
      ) : null}

      {note ? (
        <Meta testID="workflows-note" color={brand.ok}>
          {note}
        </Meta>
      ) : null}

      <SecondaryButton
        testID="workflows-open-voice"
        label="Open voice assistant"
        onPress={() => router.push("/voice")}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
