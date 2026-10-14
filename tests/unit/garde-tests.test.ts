import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { lireFichierEnv } from '../outils/banc'
import {
	EnvironnementRefuse,
	lireEnvironnement,
	verifierBase,
	verifierCible,
	verifierEnvironnement,
} from '../outils/garde-environnement'

const RACINE = path.resolve(import.meta.dir, '../..')
const MARQUE_DU_TEMOIN = 'TEMOIN-GARDE'

/** The bench as its environment file will describe it: everything local, every name a test name. */
const BANC = {
	APP_ENV: 'test',
	DATABASE_URI: 'postgres://banc:mot-de-passe-factice@127.0.0.1:5443/mymakeup_test',
	BASE_URL: 'http://localhost:3100',
	NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
	SMTP_HOST: '127.0.0.1',
	MAILPIT_URL: 'http://127.0.0.1:8025',
	EMAIL_FROM: 'My Makeup <ne-pas-repondre@example.test>',
	S3_ENDPOINT: 'http://127.0.0.1:9000',
	S3_BUCKET: 'mymakeup-test',
}

/**
 * Runs the witness test in a child `bun test`, with the given variables and nothing else: the
 * child reads the bunfig.toml of the repository, so it loads the guard the way every run does.
 */
async function lancerTemoin(variables: Record<string, string>) {
	const enfant = Bun.spawn([process.execPath, '--no-env-file', 'test', './tests/fixtures/temoin-garde.ts'], {
		cwd: RACINE,
		env: variables,
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, sortie, erreurs] = await Promise.all([
		enfant.exited,
		new Response(enfant.stdout).text(),
		new Response(enfant.stderr).text(),
	])
	return { code, texte: sortie + erreurs }
}

const messageDuRefus = (verifier: () => unknown): string => {
	try {
		verifier()
	} catch (erreur) {
		if (erreur instanceof EnvironnementRefuse) return erreur.message
		throw erreur
	}
	throw new Error('rien n’a été refusé')
}

describe('U85 : refuse une DATABASE_URI non locale ou dont la base ne finit pas par _test', () => {
	test.each([
		'postgres://banc:mot-de-passe-factice@127.0.0.1:5443/mymakeup_test',
		'postgresql://banc:mot-de-passe-factice@localhost/mymakeup_test',
		'postgres://banc:mot-de-passe-factice@[::1]:5443/mymakeup_test',
		'postgres://banc:mot-de-passe-factice@postgres:5432/mymakeup_test?sslmode=disable',
	])('accepte une base locale en _test : %s', uri => {
		expect(() => verifierBase(uri)).not.toThrow()
	})

	test('ne demande rien quand aucune base n’est réglée', () => {
		expect(() => verifierBase(undefined)).not.toThrow()
		expect(() => verifierBase('')).not.toThrow()
	})

	test.each([
		['hôte distant', 'postgres://banc:mot-de-passe-factice@db.example.test:5432/mymakeup_test'],
		[
			'hôte qui commence comme un hôte local',
			'postgres://banc:mot-de-passe-factice@localhost.example.test/mymakeup_test',
		],
		['base de développement du poste', 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev'],
		['_test ailleurs qu’à la fin du nom', 'postgres://banc:mot-de-passe-factice@127.0.0.1/mymakeup_test_ancienne'],
		['aucun nom de base', 'postgres://banc:mot-de-passe-factice@127.0.0.1:5443'],
		['autre chose qu’une adresse PostgreSQL', 'https://127.0.0.1/mymakeup_test'],
		['valeur illisible', 'mymakeup_test'],
	])('refuse : %s', (_cas, uri) => {
		expect(() => verifierBase(uri)).toThrow(EnvironnementRefuse)
	})

	// `pg` connects to the `host` parameter and not to the host of the address: the address below
	// reads as local and would reach the remote host. `hostaddr` is its libpq twin.
	test.each([
		['host, vers un hôte distant', '?host=db.example.test'],
		['host, avec un autre port', '?host=db.example.test&port=6543'],
		['host écrit en encodé', '?ho%73t=db.example.test'],
		['host, après un autre paramètre', '?sslmode=disable&host=db.example.test'],
		['host, même local : la garde ne lit qu’un hôte, celui de l’adresse', '?host=127.0.0.1'],
		['host vide', '?host='],
		['hostaddr', '?hostaddr=203.0.113.9'],
	])('refuse un paramètre qui remplace l’hôte de l’adresse : %s', (_cas, parametres) => {
		const uri = `postgres://banc:mot-de-passe-factice@127.0.0.1:5443/mymakeup_test${parametres}`

		expect(messageDuRefus(() => verifierBase(uri))).toStartWith('Base refusée : DATABASE_URI porte un paramètre « host')
	})

	test('le refus d’un paramètre d’hôte nomme le paramètre, jamais sa valeur ni l’adresse', () => {
		const uri = 'postgres://utilisateur-factice:mot-de-passe-factice@127.0.0.1:5443/mymakeup_test?host=db.example.test'
		const message = messageDuRefus(() => verifierBase(uri))

		expect(message).toBe(
			"Base refusée : DATABASE_URI porte un paramètre « host », qui remplace l'hôte de l'adresse. Les tests ne lisent l'hôte de la base que dans l'adresse elle-même."
		)
		expect(messageDuRefus(() => verifierEnvironnement({ ...BANC, DATABASE_URI: uri }))).toBe(message)
	})

	test('le message nomme l’hôte et la base, en français, sans l’adresse complète', () => {
		const uri = 'postgres://utilisateur-factice:mot-de-passe-factice@db.example.test:5432/mymakeup'
		const message = messageDuRefus(() => verifierBase(uri))

		expect(message).toContain('Base refusée : hôte « db.example.test », base « mymakeup ».')
		expect(message).toContain('une base locale dont le nom finit par « _test »')
		expect(message).not.toContain('mot-de-passe-factice')
		expect(message).not.toContain('utilisateur-factice')
		expect(message).not.toContain('postgres://')
		expect(message).not.toContain('5432')
	})

	test('un mot de passe qui décale les morceaux de l’adresse ne passe pas dans le message', () => {
		// The `/` ends the host early: the rest of the password lands in the database name.
		const uri = 'postgres://utilisateur-factice:123/suite-du-mot-de-passe@db.example.test/mymakeup_test'
		const message = messageDuRefus(() => verifierBase(uri))

		expect(message).toContain('base (illisible)')
		expect(message).not.toContain('suite-du-mot-de-passe')
	})

	test('arrête bun avant le premier test, avec un message sans l’adresse complète', async () => {
		const { code, texte } = await lancerTemoin({
			DATABASE_URI: 'postgres://utilisateur-factice:mot-de-passe-factice@db.example.test:5432/mymakeup',
		})

		expect(code).toBe(1)
		expect(texte).toContain('Tests arrêtés avant le premier test. Base refusée : hôte « db.example.test »')
		expect(texte).not.toContain(MARQUE_DU_TEMOIN)
		expect(texte).not.toContain('mot-de-passe-factice')
		expect(texte).not.toContain('postgres://')
	})

	test('arrête bun avant le premier test quand un paramètre host détourne une adresse locale', async () => {
		const { code, texte } = await lancerTemoin({
			...BANC,
			DATABASE_URI: `${BANC.DATABASE_URI}?host=db.example.test`,
		})

		expect(code).toBe(1)
		expect(texte).toContain(
			'Tests arrêtés avant le premier test. Base refusée : DATABASE_URI porte un paramètre « host »'
		)
		expect(texte).not.toContain(MARQUE_DU_TEMOIN)
		expect(texte).not.toContain('db.example.test')
		expect(texte).not.toContain('mot-de-passe-factice')
	})

	test('laisse tourner les tests quand tout est local : le témoin tourne', async () => {
		const { code, texte } = await lancerTemoin(BANC)

		expect(texte).toContain(MARQUE_DU_TEMOIN)
		expect(code).toBe(0)
	})
})

describe('U86 : refuse une BASE_URL e2e sur my-makeup.fr, www. ou api.', () => {
	test.each([
		'https://my-makeup.fr',
		'https://www.my-makeup.fr/auth/signin',
		'https://api.my-makeup.fr/api/health',
		'http://MY-MAKEUP.FR:443/',
		'https://localhost@www.my-makeup.fr/',
	])('refuse la prod dans tout environnement : %s', adresse => {
		expect(messageDuRefus(() => verifierCible(adresse, 'test'))).toContain('BASE_URL vise la prod')
		expect(messageDuRefus(() => verifierCible(adresse, 'preprod'))).toContain('BASE_URL vise la prod')
	})

	test.each([
		'http://localhost:3100',
		'http://127.0.0.1:3100/auth',
		'http://[::1]:3100',
	])('accepte une adresse locale : %s', adresse => {
		expect(() => verifierCible(adresse, 'test')).not.toThrow()
		expect(() => verifierCible(adresse, 'preprod')).not.toThrow()
	})

	test('n’accepte la préprod que si l’environnement déclaré est preprod', () => {
		expect(() => verifierCible('https://preprod.my-makeup.fr', 'preprod')).not.toThrow()
		expect(messageDuRefus(() => verifierCible('https://preprod.my-makeup.fr', 'test'))).toContain('APP_ENV=preprod')
	})

	test.each([
		['un hôte distant que personne n’a listé', 'https://v3.example.test'],
		['un domaine qui finit comme le site', 'https://not-my-makeup.fr'],
		['une adresse sans protocole web', 'localhost:3100'],
	])('refuse %s', (_cas, adresse) => {
		expect(() => verifierCible(adresse, 'test')).toThrow(EnvironnementRefuse)
		expect(() => verifierCible(adresse, 'preprod')).toThrow(EnvironnementRefuse)
	})

	test.each(['BASE_URL', 'NEXT_PUBLIC_SITE_URL'])('la garde lit %s dans l’environnement et nomme la variable', nom => {
		const message = messageDuRefus(() => verifierEnvironnement({ ...BANC, [nom]: 'https://www.my-makeup.fr' }))

		expect(message).toBe(`${nom} vise la prod (« www.my-makeup.fr ») : aucun test ne vise la prod.`)
	})
})

describe('U87 : refuse un domaine d’envoi ou un bucket de prod dans l’environnement de test', () => {
	test('accepte le banc : capteur de mails et stockage locaux, expéditeur réservé, bucket en -test', () => {
		expect(verifierEnvironnement(BANC)).toBe('test')
		expect(
			verifierEnvironnement({
				...BANC,
				SMTP_HOST: 'mailpit',
				MAILPIT_URL: 'http://mailpit:8025',
				S3_ENDPOINT: 'http://s3mock:9090',
			})
		).toBe('test')
		expect(verifierEnvironnement({})).toBe('test')
	})

	test('le fichier .env.test du dépôt passe la garde : c’est l’environnement du banc', () => {
		const fichier = lireFichierEnv(readFileSync(path.join(RACINE, '.env.test'), 'utf8'))

		expect(verifierEnvironnement(fichier)).toBe('test')
		// Each rule of the guard has something to read in the file: none passes for want of a variable.
		for (const nom of [
			'APP_ENV',
			'DATABASE_URI',
			'NEXT_PUBLIC_SITE_URL',
			'SMTP_HOST',
			'MAILPIT_URL',
			'EMAIL_FROM',
			'S3_ENDPOINT',
			'S3_BUCKET',
		])
			expect({ nom, valeur: fichier[nom] }).toEqual({ nom, valeur: expect.any(String) })
	})

	test('l’expéditeur du banc est sur un domaine réservé : la garde refuse ce fichier dès qu’il écrit au nom du site', () => {
		const fichier = lireFichierEnv(readFileSync(path.join(RACINE, '.env.test'), 'utf8'))

		expect(fichier.EMAIL_FROM).toEndWith('@example.test>')
		expect(
			messageDuRefus(() =>
				verifierEnvironnement({ ...fichier, EMAIL_FROM: 'My Makeup <ne-pas-repondre@send.my-makeup.fr>' })
			)
		).toStartWith("EMAIL_FROM cite un domaine d'envoi réel (« send.my-makeup.fr »)")
	})

	test.each([
		['EMAIL_FROM', 'My Makeup <ne-pas-repondre@send.my-makeup.fr>', 'send.my-makeup.fr'],
		['MAILGUN_DOMAIN', 'mg.my-makeup.fr', 'mg.my-makeup.fr'],
		['SMTP_FROM', 'contact@MY-MAKEUP.FR', 'my-makeup.fr'],
	])('refuse le domaine d’envoi du site dans %s', (nom, valeur, domaine) => {
		const message = messageDuRefus(() => verifierEnvironnement({ ...BANC, [nom]: valeur }))

		expect(message).toStartWith(`${nom} cite un domaine d'envoi réel (« ${domaine} »)`)
	})

	test('laisse passer un expéditeur dont le domaine réservé ressemble à celui du site', () => {
		expect(() => verifierEnvironnement({ ...BANC, EMAIL_FROM: 'contact@my-makeup.fr.test' })).not.toThrow()
		expect(() => verifierEnvironnement({ ...BANC, EMAIL_FROM: 'contact@not-my-makeup.fr' })).not.toThrow()
	})

	test('refuse un relais de mails qui n’est pas le capteur local', () => {
		const message = messageDuRefus(() => verifierEnvironnement({ ...BANC, SMTP_HOST: 'smtp.resend.com' }))

		expect(message).toStartWith('SMTP_HOST refusé (« smtp.resend.com »)')
	})

	test.each([
		['un capteur distant', 'https://mailpit.example.test', '« mailpit.example.test »'],
		['une adresse sans protocole web', '127.0.0.1:8025', undefined],
	])('refuse %s dans MAILPIT_URL', (_cas, adresse, hote) => {
		const message = messageDuRefus(() => verifierEnvironnement({ ...BANC, MAILPIT_URL: adresse }))

		expect(message).toStartWith('MAILPIT_URL')
		if (hote) expect(message).toContain(hote)
	})

	test.each([
		'my-makeup',
		'mymakeup-test-archive',
		'mymakeup_test',
	])('refuse un bucket dont le nom ne finit pas par -test : %s', bucket => {
		const message = messageDuRefus(() => verifierEnvironnement({ ...BANC, S3_BUCKET: bucket }))

		expect(message).toStartWith(`S3_BUCKET refusé (« ${bucket} »)`)
	})

	test.each([
		[
			'un stockage distant',
			'https://compte-factice.r2.cloudflarestorage.com',
			'« compte-factice.r2.cloudflarestorage.com »',
		],
		['une adresse sans protocole web', '127.0.0.1:9000', undefined],
	])('refuse %s dans S3_ENDPOINT', (_cas, adresse, hote) => {
		const message = messageDuRefus(() => verifierEnvironnement({ ...BANC, S3_ENDPOINT: adresse }))

		expect(message).toStartWith('S3_ENDPOINT')
		if (hote) expect(message).toContain(hote)
	})
})

describe('Trois environnements reconnus : test, preprod, prod (toujours refusée)', () => {
	test('rien de déclaré vaut test, le plus strict', () => {
		expect(lireEnvironnement(undefined)).toBe('test')
		expect(lireEnvironnement('')).toBe('test')
	})

	test('test et preprod sont admis', () => {
		expect(lireEnvironnement('test')).toBe('test')
		expect(lireEnvironnement('preprod')).toBe('preprod')
		expect(verifierEnvironnement({ ...BANC, APP_ENV: 'preprod', BASE_URL: 'https://preprod.my-makeup.fr' })).toBe(
			'preprod'
		)
	})

	test('prod est refusée même quand tout le reste est local', () => {
		const message = messageDuRefus(() => verifierEnvironnement({ ...BANC, APP_ENV: 'prod' }))

		expect(message).toBe('APP_ENV vaut « prod » : aucun test ne tourne en environnement de prod.')
	})

	test.each(['production', 'dev', 'PROD', 'préprod'])('un environnement inconnu est refusé : %s', valeur => {
		expect(messageDuRefus(() => lireEnvironnement(valeur))).toContain('environnement inconnu')
	})

	test('en preprod, la base et les envois restent ceux du banc', () => {
		const preprod = { ...BANC, APP_ENV: 'preprod', BASE_URL: 'https://preprod.my-makeup.fr' }

		expect(() =>
			verifierEnvironnement({ ...preprod, DATABASE_URI: 'postgres://u:p@db.example.test/mymakeup' })
		).toThrow(EnvironnementRefuse)
		expect(() => verifierEnvironnement({ ...preprod, SMTP_HOST: 'smtp.resend.com' })).toThrow(EnvironnementRefuse)
	})

	test('arrête bun avant le premier test quand l’environnement déclaré est prod', async () => {
		const { code, texte } = await lancerTemoin({ ...BANC, APP_ENV: 'prod' })

		expect(code).toBe(1)
		expect(texte).toContain('Tests arrêtés avant le premier test. APP_ENV vaut « prod »')
		expect(texte).not.toContain(MARQUE_DU_TEMOIN)
	})
})
