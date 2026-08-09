/**
 * Constitutional AI critique generation — staged.
 * Wire to inference gateway when CLAWQL_ENABLE_TRAINING=1.
 */
export async function generateCritique(_input: {
  originalResponse: string;
  principles: string[];
  critiquePrompt: string;
}): Promise<string> {
  throw new Error("generateCritique not implemented — Constitutional AI augmentor is staged");
}

export async function generateRevision(_input: {
  originalResponse: string;
  critique: string;
  revisionPrompt: string;
}): Promise<string> {
  throw new Error("generateRevision not implemented — Constitutional AI augmentor is staged");
}
