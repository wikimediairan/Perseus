import js from "@eslint/js";
import globals from "globals";

import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import tailwind from "eslint-plugin-tailwindcss";

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "src-tauri/target",
      "node_modules",
      "coverage",
      "*.config.js",
      "*.config.ts",
      "vite.config.ts",
      "scripts/**/*.mjs",
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ["**/*.{ts,tsx}"],

    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },

      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
      "unused-imports": unusedImports,
      tailwindcss: tailwind,
    },

    settings: {
      react: {
        version: "detect",
      },

      "import/resolver": {
        typescript: true,
      },

      tailwindcss: {
        cssConfigPath: "./src/index.css",
      },
    },

    rules: {
      "@typescript-eslint/consistent-type-imports": "error",

      "@typescript-eslint/no-floating-promises": "error",

      "@typescript-eslint/no-misused-promises": "error",

      "@typescript-eslint/no-unnecessary-condition": "warn",

      "@typescript-eslint/no-explicit-any": "warn",

      "@typescript-eslint/explicit-function-return-type": "off",

      "import/order": [
        "warn",
        {
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
          "newlines-between": "always",
        },
      ],

      "unused-imports/no-unused-imports": "error",

      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      "react/react-in-jsx-scope": "off",

      "react/jsx-uses-react": "off",

      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],

      ...reactHooks.configs.recommended.rules,

      "tailwindcss/classnames-order": "warn",

      "tailwindcss/no-custom-classname": "off",

      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],
    },
  },
);
