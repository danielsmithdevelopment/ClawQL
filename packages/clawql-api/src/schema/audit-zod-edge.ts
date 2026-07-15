/**
 * Thin Zod shapes for MCP SDK `audit` tool registration.
 * Domain validation: {@link decodeAuditInput} in clawql-core.
 */

import { z } from "zod";
import {
  AUDIT_ACTION_DESCRIPTION,
  AUDIT_CATEGORY_DESCRIPTION,
  AUDIT_CORRELATION_ID_DESCRIPTION,
  AUDIT_LIMIT_DESCRIPTION,
  AUDIT_OPERATION_DESCRIPTION,
  AUDIT_SUMMARY_DESCRIPTION,
} from "clawql-core";

export const auditToolZodShape = {
  operation: z.enum(["append", "list", "clear"]).describe(AUDIT_OPERATION_DESCRIPTION),
  category: z.string().max(64).optional().describe(AUDIT_CATEGORY_DESCRIPTION),
  action: z.string().max(128).optional().describe(AUDIT_ACTION_DESCRIPTION),
  summary: z.string().max(512).optional().describe(AUDIT_SUMMARY_DESCRIPTION),
  correlationId: z.string().max(128).optional().describe(AUDIT_CORRELATION_ID_DESCRIPTION),
  limit: z.number().int().min(1).max(100).optional().describe(AUDIT_LIMIT_DESCRIPTION),
} as const;
