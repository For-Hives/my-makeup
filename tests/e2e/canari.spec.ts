// Canary of the CI (docs/qualite.md): this file is wrong on purpose and is never merged.
import { expect, test } from '@playwright/test'

test('canary: a false end-to-end test', () => {
	expect(1 + 1).toBe(3)
})
