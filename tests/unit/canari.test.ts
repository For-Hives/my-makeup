// Canary of the CI (docs/qualite.md): this file is wrong on purpose and is never merged.
import { expect, test } from 'bun:test'

test('canary: a false test', () => {
	expect(1 + 1).toBe(3)
})
