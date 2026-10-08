// Playwright for the artist's space scenarios, launched by
// tests/regression/run.mjs (npm run test:regression), which builds the app
// and starts it with the fake Strapi. One worker: the tests share the fake
// Strapi and reset it before each test.
import { defineConfig } from '@playwright/test'

const APP = process.env.RG_APP ?? 'http://localhost:3996'

// Never against the production: local hosts only
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(APP).hostname))
	throw new Error(`cible non locale refusée : ${APP}`)

export default defineConfig({
	testDir: '.',
	// only the specs of this folder (the unit tests are *.test.mjs)
	testMatch: '**/*.spec.mjs',
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [['list']],
	outputDir: '../../.next-test-regression-journaux/resultats',
	use: {
		baseURL: APP,
		locale: 'fr-FR',
		timezoneId: 'Europe/Paris',
		viewport: { width: 1440, height: 900 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
})
