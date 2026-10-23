// Not a test of the suite: nothing in its name makes bun or Playwright pick it up.
// tests/integration/bench-accounts.test.ts runs it in a child process, under the environment of
// the bench, to read everything one use of the account factory prints: the logs of Payload at
// their most talkative, and the account the factory gives back.
//
// The password is given by the test, so that the test knows what to look for.

import { createAccount } from '../support/account-factory'
import { testPayload } from '../support/payload-test'

const password = process.env.SENTINEL_PASSWORD
if (!password) throw new Error('SENTINEL_PASSWORD manque')

const payload = await testPayload()
payload.logger.level = 'trace'

const account = await createAccount('admin', { motDePasse: () => password })

console.log(`TEMOIN-FABRIQUE ${JSON.stringify(account)}`)
process.exit(0)
