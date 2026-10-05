import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '**/target', 'bootstrapper/dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Los providers de src/lib exportan junto al componente su hook y alguna constante:
      // es el patrón de contexto de la app (sólo afecta al recargado en caliente en dev).
      'react-refresh/only-export-components': ['error', {
        allowConstantExport: true,
        allowExportNames: ['useGameMode', 'DEFAULT_GAMES', 'useI18n', 'pick', 'LANGS', 'useInstaller', 'useUninstall', 'useUpdater'],
      }],
    },
  },
])
