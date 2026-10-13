import { defineConfig, devices } from '@playwright/test'

const WEB_URL = 'http://localhost:5173'
const API_HEALTH_URL = 'http://localhost:3000/api/trpc/health'

const reuseExistingServer = !process.env.CI

export default defineConfig({
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Un serveur Playwright par application, et non `pnpm dev` : Playwright donne à chaque serveur
  // un stdin en pipe, et avec un stdin partagé par l'API (tsx watch) et le front, Vite ne démarre
  // jamais. Ce sont les mêmes scripts `dev` que ceux lancés par `pnpm dev`.
  webServer: [
    {
      command: 'pnpm --filter @encheres/api dev',
      cwd: '..',
      // Base à part : les comptes créés par les tests ne se mêlent pas à ceux du développement.
      env: { MONGO_URL: 'mongodb://127.0.0.1:27017/encheres-e2e' },
      url: API_HEALTH_URL,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @encheres/web dev',
      cwd: '..',
      url: WEB_URL,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
})
