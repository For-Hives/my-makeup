/** The entry of `bun run bascule:controle` (ticket 173): see scripts/bascule/controle-hote.ts. */
import { lancer } from './controle-hote'

process.exit(
	await lancer({
		CONTROLE_HOTE_CIBLE: process.env.CONTROLE_HOTE_CIBLE,
		CONTROLE_HOTE_SORTIE: process.env.CONTROLE_HOTE_SORTIE,
		PREPROD_BASIC_AUTH_PASSWORD: process.env.PREPROD_BASIC_AUTH_PASSWORD,
		PREPROD_BASIC_AUTH_USER: process.env.PREPROD_BASIC_AUTH_USER,
	})
)
