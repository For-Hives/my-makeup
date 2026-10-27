/**
 * `bun run emails:render [dossier]`: writes the HTML and the text of the mails of src/emails into a folder
 * (default `.emails-preview/`, ignored by git), the images read from the working copy. Nothing is sent.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { render } from '@react-email/components'
import AnnonceMaquilleuses from '../../src/emails/annonce-maquilleuses'

const out = path.resolve(process.argv[2] ?? '.emails-preview')
mkdirSync(out, { recursive: true })
const assetsBase = process.env.EMAIL_ASSETS_BASE ?? path.resolve('public/assets/email')
const element = <AnnonceMaquilleuses assetsBase={assetsBase} />
writeFileSync(path.join(out, 'annonce-maquilleuses.html'), await render(element))
writeFileSync(path.join(out, 'annonce-maquilleuses.txt'), await render(element, { plainText: true }))
console.log(`Écrit dans ${out}`)
