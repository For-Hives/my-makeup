import { test } from 'bun:test'

// Not a test of the suite: nothing in its name makes bun or Playwright pick it up.
// tests/unit/garde-tests.test.ts runs it in a child `bun test`, under an environment of its
// choice, to see whether a test still starts once the guard has read that environment.
test('témoin de la garde', () => {
	console.log('TEMOIN-GARDE : un test a tourné')
})
