/**
 * Layer 3 meta-ontology evidence types (OBT / RTP observations).
 */
import type { CQEEntity, QueryGoal } from "../../shared/cqe-runtime-types.js";

export type FieldObservation = {
  entityId: string;
  fieldName: string;
  wasNull: boolean;
  wasExtracted: boolean;
  documentType?: string;
  contributedToPass?: boolean;
};

export type QueryObservation = {
  entityId: string;
  filters: Record<string, unknown>;
  resultCount: number;
  queryType?: string;
  contributed: boolean;
  criterionPassRate: number;
  goal?: QueryGoal;
};

export type EntityObservation = {
  entityId: string;
  documentType: string;
  entity: CQEEntity;
  criterionPassRate: number;
};

export type OntologyEvidence = {
  entityObservations: EntityObservation[];
  fieldObservations: FieldObservation[];
  queryObservations: QueryObservation[];
};

/** Minimal OBT / RTP shapes accepted by the trace ingester. */
export type OBTTurnExecution = {
  toolName?: string;
  payload?: Record<string, unknown>;
  result?: {
    filteredEntities?: number;
    queryType?: string;
    hits?: Array<{
      confidence?: string;
      fields?: Record<string, unknown>;
    }>;
  };
};

export type OBTTurn = {
  execution?: OBTTurnExecution;
};

export type OBTVerdict = {
  criterionPassRate: number;
};

export type OBTRecord = {
  verdict?: OBTVerdict;
  rtp?: {
    turnSequence?: OBTTurn[];
  };
  taskMeta?: {
    documentType?: string;
    entityId?: string;
    scaffoldedEntity?: CQEEntity;
  };
};
