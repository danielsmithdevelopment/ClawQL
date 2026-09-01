declare module "clawql-inference" {
  export interface InferenceStore {
    getByCorrelationId(correlationId: string): Promise<unknown[]>;
  }

  export function createInferenceStore(options?: {
    env?: NodeJS.ProcessEnv;
  }): InferenceStore | null;
}
