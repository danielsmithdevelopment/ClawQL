/**
 * Tracks in-flight protobuf MCP work so `model_context_protocol.Mcp.CancelTask` can abort
 * the linked `@modelcontextprotocol/sdk` request via `AbortSignal`.
 */
export class TaskCancellationRegistry {
  private readonly tasks = new Map<string, AbortController>();

  register(taskId: string, ac: AbortController): void {
    this.tasks.set(taskId, ac);
  }

  unregister(taskId: string): void {
    this.tasks.delete(taskId);
  }

  /** Aborts the active task, if any. Returns whether a controller was found. */
  cancel(taskId: string): boolean {
    const ac = this.tasks.get(taskId);
    if (!ac) {
      return false;
    }
    ac.abort();
    return true;
  }
}
