import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    'playwright-report/**',
    'test-results/**',
    'docs/**',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  pluginVue.configs['flat/recommended'],

  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // AGENTS.md : TypeScript strict, pas de `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Une promesse oubliée est une erreur silencieuse (handlers Fastify, Socket.IO).
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },

  // Les fichiers .vue sont analysés avec le parseur TypeScript pour <script setup lang="ts">.
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { parser: tseslint.parser },
    },
  },

  // Fichiers de configuration en JavaScript : pas de règles typées.
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Toujours en dernier : désactive les règles de style gérées par Prettier.
  prettier,
])
