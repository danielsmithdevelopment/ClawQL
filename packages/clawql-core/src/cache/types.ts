export type CacheSetResult =
  | {
      readonly ok: true;
      readonly operation: "set";
      readonly key: string;
      readonly evicted?: number;
    }
  | { readonly ok: false; readonly error: string };

export type CacheGetResult =
  | { readonly ok: true; readonly hit: true; readonly key: string; readonly value: string }
  | { readonly ok: true; readonly hit: false; readonly key: string };

export type CacheDeleteResult = {
  readonly ok: true;
  readonly operation: "delete";
  readonly key: string;
  readonly deleted: boolean;
};

export type CacheListResult = {
  readonly ok: true;
  readonly operation: "list";
  readonly prefix?: string;
  readonly count: number;
  readonly keys: readonly string[];
};

export type CacheSearchResult = {
  readonly ok: true;
  readonly operation: "search";
  readonly query: string;
  readonly count: number;
  readonly keys: readonly string[];
};

export type CacheOperationInput =
  | { readonly operation: "set"; readonly key: string; readonly value: string }
  | { readonly operation: "get"; readonly key: string }
  | { readonly operation: "delete"; readonly key: string }
  | { readonly operation: "list"; readonly prefix?: string; readonly limit?: number }
  | { readonly operation: "search"; readonly query: string; readonly limit?: number };

export type CacheOperationResult =
  CacheSetResult | CacheGetResult | CacheDeleteResult | CacheListResult | CacheSearchResult;
