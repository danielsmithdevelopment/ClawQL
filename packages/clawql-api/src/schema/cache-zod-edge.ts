/**
 * Thin Zod shapes for MCP SDK `cache` tool registration.
 * Domain validation: {@link decodeCacheInput} in clawql-core.
 */

import { z } from "zod";
import {
  CACHE_KEY_DESCRIPTION,
  CACHE_LIMIT_DESCRIPTION,
  CACHE_OPERATION_DESCRIPTION,
  CACHE_PREFIX_DESCRIPTION,
  CACHE_QUERY_DESCRIPTION,
  CACHE_VALUE_DESCRIPTION,
} from "clawql-core";

export const cacheToolZodShape = {
  operation: z
    .enum(["set", "get", "delete", "list", "search"])
    .describe(CACHE_OPERATION_DESCRIPTION),
  key: z.string().max(2048).optional().describe(CACHE_KEY_DESCRIPTION),
  value: z.string().optional().describe(CACHE_VALUE_DESCRIPTION),
  prefix: z.string().max(2048).optional().describe(CACHE_PREFIX_DESCRIPTION),
  query: z.string().max(512).optional().describe(CACHE_QUERY_DESCRIPTION),
  limit: z.number().int().min(1).max(1000).optional().describe(CACHE_LIMIT_DESCRIPTION),
} as const;
