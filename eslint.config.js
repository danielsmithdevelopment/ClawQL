import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Type-aware rules are skipped for now (single tsconfig excludes tests). Recommended rules only.
 */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
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
