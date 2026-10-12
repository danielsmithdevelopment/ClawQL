/**
 * Document capture for review evidence — camera or photo library.
 * Fixture / web: synthetic URI so Maestro and demos work without a device camera.
 */
import * as ImagePicker from "expo-image-picker";
import { Context, Data, Effect, Layer } from "effect";
import { Platform } from "react-native";

import type { DocumentAttachment } from "../domain/schemas";
import { loadMobileConfigEffect } from "./config";

export class DocumentError extends Data.TaggedError("DocumentError")<{
  readonly reason: string;
}> {}

export type CaptureSource = "camera" | "library";

function nextAttachmentId(): string {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function syntheticAttachment(
  reviewId: string,
  source: CaptureSource
): DocumentAttachment {
  const id = nextAttachmentId();
  return {
    id,
    reviewId,
    uri: `fixture://document/${id}.jpg`,
    fileName: `scan-${id.slice(4, 10)}.jpg`,
    mimeType: "image/jpeg",
    source,
    capturedAtMs: Date.now(),
    bytes: 48_120,
  };
}

/**
 * Capture a document photo (camera) or pick from library.
 * Returns metadata + local URI; caller persists via API.
 */
export function captureDocumentEffect(input: {
  reviewId: string;
  source: CaptureSource;
}): Effect.Effect<DocumentAttachment, DocumentError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || Platform.OS === "web") {
      return syntheticAttachment(input.reviewId, input.source);
    }

    if (input.source === "camera") {
      const cam = yield* Effect.tryPromise({
        try: () => ImagePicker.requestCameraPermissionsAsync(),
        catch: (cause) =>
          new DocumentError({
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      });
      if (!cam.granted) {
        return yield* Effect.fail(new DocumentError({ reason: "camera_permission_denied" }));
      }
    } else {
      const lib = yield* Effect.tryPromise({
        try: () => ImagePicker.requestMediaLibraryPermissionsAsync(),
        catch: (cause) =>
          new DocumentError({
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      });
      if (!lib.granted) {
        return yield* Effect.fail(new DocumentError({ reason: "library_permission_denied" }));
      }
    }

    const result = yield* Effect.tryPromise({
      try: () =>
        input.source === "camera"
          ? ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 0.85,
              allowsEditing: true,
              aspect: [3, 4],
            })
          : ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.85,
              allowsEditing: true,
              aspect: [3, 4],
            }),
      catch: (cause) =>
        new DocumentError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    if (result.canceled || !result.assets?.[0]) {
      return yield* Effect.fail(new DocumentError({ reason: "capture_cancelled" }));
    }
    const asset = result.assets[0]!;
    const id = nextAttachmentId();
    return {
      id,
      reviewId: input.reviewId,
      uri: asset.uri,
      fileName: asset.fileName ?? `scan-${id.slice(4, 10)}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
      source: input.source,
      capturedAtMs: Date.now(),
      bytes: asset.fileSize,
    };
  });
}

export const CLAWQL_DOCUMENTS_TAG = "clawql/MobileDocuments" as const;

export class MobileDocuments extends Context.Service<
  typeof CLAWQL_DOCUMENTS_TAG,
  {
    readonly captureDocument: (input: {
      reviewId: string;
      source: CaptureSource;
    }) => Effect.Effect<DocumentAttachment, DocumentError>;
  }
>()(CLAWQL_DOCUMENTS_TAG) {}

export const MobileDocumentsLive = Layer.succeed(MobileDocuments, {
  captureDocument: captureDocumentEffect,
});
