/**
 * Lifecycle hooks so schedule projection snapshots are deleted when the
 * stream.changed subscription that justified keeping them ends.
 */

export type StreamTopicReleasedHandler = (
  topic: string,
  reason: "unsubscribe" | "access_revoked" | "gone" | "expired"
) => void | Promise<void>;

let topicReleasedHandler: StreamTopicReleasedHandler | null = null;

export function setStreamTopicReleasedHandler(
  handler: StreamTopicReleasedHandler | null
): void {
  topicReleasedHandler = handler;
}

export function getStreamTopicReleasedHandler(): StreamTopicReleasedHandler | null {
  return topicReleasedHandler;
}

export function notifyStreamTopicReleased(
  topic: string,
  reason: "unsubscribe" | "access_revoked" | "gone" | "expired"
): void {
  const h = topicReleasedHandler;
  if (!h || !topic.trim()) return;
  void Promise.resolve()
    .then(() => h(topic.trim(), reason))
    .catch(() => undefined);
}
