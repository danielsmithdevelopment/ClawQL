/**
 * Types for the webmcp-draft provider (spec v0.1).
 * Types-only — no Effect wrapper required.
 */

/** Minimal JSON Schema shape used in drafted tool inputSchema. */
export type JsonSchema = {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly description?: string;
  readonly items?: JsonSchema;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly [key: string]: unknown;
};

export type DraftSourceType = "openapi" | "graphql" | "forms";

export type DraftConfidence = "high" | "medium" | "low";

export type ProposedWebMcpTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
};

export type DraftCandidate = {
  readonly candidateId: string;
  readonly sourceType: DraftSourceType;
  readonly sourceRef: string;
  readonly proposedTool: ProposedWebMcpTool;
  readonly confidence: DraftConfidence;
  readonly inferenceNotes: string;
};

export type DraftCandidateStatus = "pending" | "approved" | "rejected" | "published";

export type StoredDraftCandidate = DraftCandidate & {
  readonly status: DraftCandidateStatus;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly editedTool?: Partial<ProposedWebMcpTool>;
};

export type DraftReviewActionKind = "approve" | "reject" | "edit-and-approve";

export type DraftReviewAction = {
  readonly candidateId: string;
  readonly action: DraftReviewActionKind;
  readonly editedTool?: Partial<ProposedWebMcpTool>;
  readonly reviewedBy: string;
};

export type BoundOperation = {
  readonly toolName: string;
  readonly sourceType: DraftSourceType;
  readonly sourceRef: string;
};

export type PublishedWebMcpVersion = {
  readonly versionId: string;
  readonly publishedTools: readonly ProposedWebMcpTool[];
  readonly bindings: readonly BoundOperation[];
  readonly publishedAt: string;
  readonly publishedBy: string;
  readonly previousVersionId: string | null;
};

/** Loose OpenAPI document shape — enough for heuristic drafting. */
export type OpenApiDocument = {
  readonly openapi?: string;
  readonly info?: { readonly title?: string; readonly version?: string };
  readonly paths?: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          {
            readonly operationId?: string;
            readonly summary?: string;
            readonly description?: string;
            readonly tags?: readonly string[];
            readonly parameters?: readonly {
              readonly name: string;
              readonly in: string;
              readonly required?: boolean;
              readonly schema?: JsonSchema;
              readonly description?: string;
            }[];
            readonly requestBody?: {
              readonly required?: boolean;
              readonly content?: Readonly<
                Record<string, { readonly schema?: JsonSchema }>
              >;
            };
          }
        >
      >
    >
  >;
};

/** Loose GraphQL SDL / introspection-ish input for stub drafting. */
export type GraphQlSchemaInput = {
  readonly sdl?: string;
  readonly mutations?: readonly {
    readonly name: string;
    readonly description?: string;
    readonly args?: readonly {
      readonly name: string;
      readonly type: string;
      readonly description?: string;
      readonly required?: boolean;
    }[];
  }[];
  readonly queries?: readonly {
    readonly name: string;
    readonly description?: string;
    readonly args?: readonly {
      readonly name: string;
      readonly type: string;
      readonly description?: string;
      readonly required?: boolean;
    }[];
  }[];
};

/** Rendered HTML form / interactive element snapshot for form inference. */
export type HtmlFormSnapshot = {
  readonly selector: string;
  readonly action?: string;
  readonly method?: string;
  readonly name?: string;
  readonly fields: readonly {
    readonly name: string;
    readonly type?: string;
    readonly label?: string;
    readonly required?: boolean;
  }[];
};
