/**
 * Compile-fail mistakes for memory erase EraseAuthorized (gdp-ts).
 */
import { Effect } from "effect";
import { name, PrincipalId, VaultPath, type Named, type Proof } from "clawql-gdp";
import type { EraseAuthorized } from "./proofs/erase-authorized.js";
import { executeMemoryEraseAuthorizedEffect } from "./erase/erase.js";

interface BogusProof<P, V> extends Proof<"BogusEraseProof", [P, V]> {
  readonly __proofBrand?: "BogusEraseProof";
}

declare function mintErase<P, V>(
  principal: Named<P, ReturnType<typeof PrincipalId>>,
  path: Named<V, ReturnType<typeof VaultPath>>
): EraseAuthorized<P, V>;

declare function mintBogus<P, V>(
  principal: Named<P, ReturnType<typeof PrincipalId>>,
  path: Named<V, ReturnType<typeof VaultPath>>
): BogusProof<P, V>;

export function eraseMistakes(): Effect.Effect<void> {
  return name(
    PrincipalId("vk_abc"),
    VaultPath("Memory/a.md"),
    VaultPath("Memory/b.md"),
    (principal, pathA, pathB) => {
      const proofA = mintErase(principal, pathA);
      const wrongProof = mintBogus(principal, pathA);

      // @ts-expect-error no proof at all
      void executeMemoryEraseAuthorizedEffect(principal, pathA, {
        path: pathA.value,
      });

      // @ts-expect-error a raw id is not a named value; name it first
      void executeMemoryEraseAuthorizedEffect(principal, VaultPath("Memory/raw.md"), proofA, {
        path: "Memory/raw.md",
      });

      // @ts-expect-error the proof is about path A, not path B
      void executeMemoryEraseAuthorizedEffect(principal, pathB, proofA, {
        path: pathB.value,
      });

      // @ts-expect-error wrong proof kind
      void executeMemoryEraseAuthorizedEffect(principal, pathA, wrongProof, {
        path: pathA.value,
      });

      void executeMemoryEraseAuthorizedEffect(principal, pathA, proofA, {
        path: pathA.value,
      });
      return Effect.void;
    }
  );
}
