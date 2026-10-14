import { Effect } from "effect";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { MemoryField, MemoryResult } from "@/src/domain/schemas";
import { getMemoryByIdEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  LoadingBlock,
  Meta,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  SurfaceCard,
} from "@/src/ui/primitives";

export default function MemoryDetailScreen() {
  const { session } = useSession();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [result, setResult] = useState<MemoryResult | null>(null);
  const [fields, setFields] = useState<readonly MemoryField[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    void Effect.runPromise(getMemoryByIdEffect(session, id)).then((row) => {
      if (!row) {
        setMissing(true);
        return;
      }
      setResult(row.result);
      setFields(row.fields);
    });
  }, [id, session]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  if (missing) {
    return (
      <ScreenScroll testID="memory-detail-missing">
        <SectionHeader icon="agents" title="Not found" subtitle="This memory item is gone." />
        <SecondaryButton label="Back" onPress={() => router.back()} />
      </ScreenScroll>
    );
  }

  if (!result) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="memory-detail-screen">
      <SectionHeader icon="agents" title={result.title} subtitle={result.summary} />
      <Badge label={result.badge} tone={result.badgeTone} />

      <SurfaceCard testID="memory-fields">
        <Body>Fields</Body>
        <Column spacing={space.sm}>
          {fields.map((field) => (
            <SurfaceCard key={field.field} testID={`memory-field-${field.field}`} tint="soft">
              <Body>{field.field}</Body>
              <Meta>{field.value}</Meta>
              <Meta color={brand.inkFaint}>{`${field.source} · ${field.confidence}`}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>

      <SecondaryButton label="Back to explorer" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
