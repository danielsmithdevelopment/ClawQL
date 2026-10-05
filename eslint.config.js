import eslint from "@eslint/js";
import gdp from "@gdp-ts/core/lint/eslint";
import tseslint from "typescript-eslint";

/**
 * Type-aware rules are skipped for now (single tsconfig excludes tests). Recommended rules only.
 * gdp-ts preset: ban defineProof / proof forgeries outside trusted proofs dirs (layer-1).
 */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...gdp({
    files: ["packages/**/*.ts", "src/**/*.ts"],
    proofs: ["**/proofs/**"],
    allowAssertions: ["**/ids.ts"],
    strict: false,
  }),
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "providers/**",
      "apps/docs/**",
      "coverage/**",
      "scripts/**",
      "*.mjs",
      "eslint.config.js",
    ],
  },
  {
    // Tests may still use defineProof only inside **/proofs/** (trusted modules).
    // Never relax no-proof-assertion: forged `as Proof` must fail CI everywhere.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["packages/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../../../src",
                "../../../src/*",
                "../../../src/**",
                "../../../../src",
                "../../../../src/*",
                "../../../../src/**",
                "../../../../../src",
                "../../../../../src/*",
                "../../../../../src/**",
              ],
              message:
                "Workspace packages must not import the MCP host (src/). Use package subpaths.",
            },
          ],
        },
      ],
    },
  }
);
