/**
 * Ouroboros harness consumer of the Fast Decision skill fast-path (§4).
 * Validity is checked live via SkillValidityStore — never cached across turns.
 */

export {
  decideSkillFastPath,
  SkillValidityStore,
  InMemorySkillValidityStoreLive,
  type SkillFastPathDecision,
  type SkillValidityStatus,
} from "clawql-core/classifier";
