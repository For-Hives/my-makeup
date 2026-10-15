/** The entry of `bun run preprod:remise-ci` (ticket 174): see scripts/preprod/remise-ci.ts. */
import { remettreLaPreprod } from './remise-ci'

process.exit(
	await remettreLaPreprod(
		{
			COOLIFY_TOKEN: process.env.COOLIFY_TOKEN,
			COOLIFY_URL: process.env.COOLIFY_URL,
			PREPROD_BASIC_AUTH_PASSWORD: process.env.PREPROD_BASIC_AUTH_PASSWORD,
			PREPROD_BASIC_AUTH_USER: process.env.PREPROD_BASIC_AUTH_USER,
			REMISE_IDENTIFIANT: process.env.REMISE_IDENTIFIANT,
			REMISE_TENTATIVE: process.env.REMISE_TENTATIVE,
		},
		{
			lire: (adresse, init) => fetch(adresse, init),
			journal: ligne => console.log(ligne),
			attendre: ms => Bun.sleep(ms),
			maintenant: () => Date.now(),
		}
	)
)
