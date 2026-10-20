/** The entry of `bun run bascule:controle` (ticket 173): see scripts/bascule/controle-hote.ts. */
import { lancer } from './host-check'

process.exit(
	await lancer({
		CONTROLE_HOTE_ACCES_MOT_DE_PASSE: process.env.CONTROLE_HOTE_ACCES_MOT_DE_PASSE,
		CONTROLE_HOTE_ACCES_UTILISATEUR: process.env.CONTROLE_HOTE_ACCES_UTILISATEUR,
		CONTROLE_HOTE_CIBLE: process.env.CONTROLE_HOTE_CIBLE,
		CONTROLE_HOTE_SORTIE: process.env.CONTROLE_HOTE_SORTIE,
	})
)
