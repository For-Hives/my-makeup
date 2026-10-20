// Not a test of the suite: nothing in its name makes bun or Playwright pick it up.
// tests/integration/banc-comptes.test.ts runs it in a child process, under the environment of
// the bench, to read everything one use of the account factory prints: the logs of Payload at
// their most talkative, and the account the factory gives back.
//
// The password is given by the test, so that the test knows what to look for.

import { creerCompte } from '../support/account-factory'
import { payloadDeTest } from '../support/payload-test'

const motDePasse = process.env.TEMOIN_MOT_DE_PASSE
if (!motDePasse) throw new Error('TEMOIN_MOT_DE_PASSE manque')

const payload = await payloadDeTest()
payload.logger.level = 'trace'

const compte = await creerCompte('admin', { motDePasse: () => motDePasse })

console.log(`TEMOIN-FABRIQUE ${JSON.stringify(compte)}`)
process.exit(0)
