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
      "website/**",
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
  }
);
