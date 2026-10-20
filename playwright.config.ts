import { defineConfig } from '@playwright/test'
import { testConfiguration } from './tests/support/e2e'

/**
 * The end-to-end tests (docs/tests/e2e.md). They are started by `bun run test:e2e`, which builds
 * the application, starts it against the local test bench and gives Playwright its environment.
 *
 * Nothing is set here. Every value comes from tests/support/e2e.ts, where the target is checked
 * by the guard of the tests before Playwright reads anything: a run that points at production
 * stops while this file is loaded, before the first test. The guard rails of the CI read the
 * same function (C07, tests/ci/ci-guardrails.test.ts): adding a setting below would escape them.
 */
export default defineConfig(testConfiguration())
