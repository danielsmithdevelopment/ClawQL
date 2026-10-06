import { Effect } from "effect";

/**
 * Strip HTML tags to plain text (SEC-10). Loop until stable so nested
 * `<scr<script>ipt>`-style splits cannot leave a tag in the stored body.
 */
export function stripHtmlToPlain(input: string): Effect.Effect<string> {
  return Effect.sync(() => {
    let previous = "";
    let current = input;
    while (current !== previous) {
      previous = current;
      current = current.replace(/<[^>]*>/g, "");
    }
    return current.replace(/[<>]/g, "");
  });
}
