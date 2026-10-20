import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readFileEnv } from '../support/bench'
import {
	checkBase,
	checkEnvironment,
	checkTarget,
	RefusedEnvironment,
	readEnvironment,
} from '../support/environment-guard'

const ROOT = path.resolve(import.meta.dir, '../..')
const SENTINEL_MARK = 'TEMOIN-GARDE'

/** The bench as its environment file will describe it: everything local, every name a test name. */
const BENCH = {
	APP_ENV: 'test',
	DATABASE_URI: 'postgres://banc:mot-de-passe-factice@127.0.0.1:5443/mymakeup_test',
	BASE_URL: 'http://localhost:3100',
	NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
	SMTP_HOST: '127.0.0.1',
	MAILPIT_URL: 'http://127.0.0.1:8025',
	EMAIL_FROM: 'My Makeup <ne-pas-repondre@example.test>',
	S3_ENDPOINT: 'http://127.0.0.1:9000',
	S3_BUCKET: 'mymakeup-test',
	GOOGLE_OIDC_ISSUER: 'http://127.0.0.1:7080',
	GOOGLE_CLIENT_ID: 'client-google-factice-du-banc',
	GOOGLE_CLIENT_SECRET: 'secret-google-factice-du-banc-de-test',
}

/**
 * Runs the witness test in a child `bun test`, with the given variables and nothing else: the
 * child reads the bunfig.toml of the repository, so it loads the guard the way every run does.
 */
async function launchSentinel(variables: Record<string, string>) {
	const child = Bun.spawn([process.execPath, '--no-env-file', 'test', './tests/fixtures/guard-sentinel.ts'], {
		cwd: ROOT,
		env: variables,
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, output, errors] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	])
	return { code, texte: output + errors }
}

const refusalMessage = (verifier: () => unknown): string => {
	try {
		verifier()
	} catch (error) {
		if (error instanceof RefusedEnvironment) return error.message
		throw error
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
		expect(() => checkBase(uri)).not.toThrow()
	})

	test('ne demande rien quand aucune base n’est réglée', () => {
		expect(() => checkBase(undefined)).not.toThrow()
		expect(() => checkBase('')).not.toThrow()
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
		expect(() => checkBase(uri)).toThrow(RefusedEnvironment)
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

		expect(refusalMessage(() => checkBase(uri))).toStartWith('Base refusée : DATABASE_URI porte un paramètre « host')
	})

	test('le refus d’un paramètre d’hôte nomme le paramètre, jamais sa valeur ni l’adresse', () => {
		const uri = 'postgres://utilisateur-factice:mot-de-passe-factice@127.0.0.1:5443/mymakeup_test?host=db.example.test'
		const message = refusalMessage(() => checkBase(uri))

		expect(message).toBe(
			"Base refusée : DATABASE_URI porte un paramètre « host », qui remplace l'hôte de l'adresse. Les tests ne lisent l'hôte de la base que dans l'adresse elle-même."
		)
		expect(refusalMessage(() => checkEnvironment({ ...BENCH, DATABASE_URI: uri }))).toBe(message)
	})

	test('le message nomme l’hôte et la base, en français, sans l’adresse complète', () => {
		const uri = 'postgres://utilisateur-factice:mot-de-passe-factice@db.example.test:5432/mymakeup'
		const message = refusalMessage(() => checkBase(uri))

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
		const message = refusalMessage(() => checkBase(uri))

		expect(message).toContain('base (illisible)')
		expect(message).not.toContain('suite-du-mot-de-passe')
	})

	test('arrête bun avant le premier test, avec un message sans l’adresse complète', async () => {
		const { code, texte: text } = await launchSentinel({
			DATABASE_URI: 'postgres://utilisateur-factice:mot-de-passe-factice@db.example.test:5432/mymakeup',
		})

		expect(code).toBe(1)
		expect(text).toContain('Tests arrêtés avant le premier test. Base refusée : hôte « db.example.test »')
		expect(text).not.toContain(SENTINEL_MARK)
		expect(text).not.toContain('mot-de-passe-factice')
		expect(text).not.toContain('postgres://')
	})

	test('arrête bun avant le premier test quand un paramètre host détourne une adresse locale', async () => {
		const { code, texte: text } = await launchSentinel({
			...BENCH,
			DATABASE_URI: `${BENCH.DATABASE_URI}?host=db.example.test`,
		})

		expect(code).toBe(1)
		expect(text).toContain(
			'Tests arrêtés avant le premier test. Base refusée : DATABASE_URI porte un paramètre « host »'
		)
		expect(text).not.toContain(SENTINEL_MARK)
		expect(text).not.toContain('db.example.test')
		expect(text).not.toContain('mot-de-passe-factice')
	})

	test('laisse tourner les tests quand tout est local : le témoin tourne', async () => {
		const { code, texte: text } = await launchSentinel(BENCH)

		expect(text).toContain(SENTINEL_MARK)
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
		expect(refusalMessage(() => checkTarget(adresse))).toContain('BASE_URL vise la prod')
	})

	test.each([
		'http://localhost:3100',
		'http://127.0.0.1:3100/auth',
		'http://[::1]:3100',
	])('accepte une adresse locale : %s', adresse => {
		expect(() => checkTarget(adresse)).not.toThrow()
	})

	test('l’ancienne préprod est refusée comme le reste de la prod (ticket 232)', () => {
		expect(refusalMessage(() => checkTarget('https://preprod.my-makeup.fr'))).toContain('BASE_URL vise la prod')
	})

	test.each([
		['un hôte distant que personne n’a listé', 'https://v3.example.test'],
		['un domaine qui finit comme le site', 'https://not-my-makeup.fr'],
		['une adresse sans protocole web', 'localhost:3100'],
	])('refuse %s', (_cas, adresse) => {
		expect(() => checkTarget(adresse)).toThrow(RefusedEnvironment)
	})

	test.each(['BASE_URL', 'NEXT_PUBLIC_SITE_URL'])('la garde lit %s dans l’environnement et nomme la variable', nom => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, [nom]: 'https://www.my-makeup.fr' }))

		expect(message).toBe(`${nom} vise la prod (« www.my-makeup.fr ») : aucun test ne vise la prod.`)
	})
})

describe('U87 : refuse un domaine d’envoi ou un bucket de prod dans l’environnement de test', () => {
	test('accepte le banc : capteur de mails et stockage locaux, expéditeur réservé, bucket en -test', () => {
		expect(checkEnvironment(BENCH)).toBe('test')
		expect(
			checkEnvironment({
				...BENCH,
				SMTP_HOST: 'mailpit',
				MAILPIT_URL: 'http://mailpit:8025',
				S3_ENDPOINT: 'http://s3mock:9090',
				GOOGLE_OIDC_ISSUER: 'http://fake-google:7080',
			})
		).toBe('test')
		expect(checkEnvironment({})).toBe('test')
	})

	test('le fichier .env.test du dépôt passe la garde : c’est l’environnement du banc', () => {
		const file = readFileEnv(readFileSync(path.join(ROOT, '.env.test'), 'utf8'))

		expect(checkEnvironment(file)).toBe('test')
		// Each rule of the guard has something to read in the file: none passes for want of a variable.
		for (const name of [
			'APP_ENV',
			'DATABASE_URI',
			'NEXT_PUBLIC_SITE_URL',
			'SMTP_HOST',
			'MAILPIT_URL',
			'EMAIL_FROM',
			'S3_ENDPOINT',
			'S3_BUCKET',
			'GOOGLE_OIDC_ISSUER',
			'GOOGLE_CLIENT_ID',
			'GOOGLE_CLIENT_SECRET',
		])
			expect({ nom: name, valeur: file[name] }).toEqual({ nom: name, valeur: expect.any(String) })
	})

	test('l’expéditeur du banc est sur un domaine réservé : la garde refuse ce fichier dès qu’il écrit au nom du site', () => {
		const file = readFileEnv(readFileSync(path.join(ROOT, '.env.test'), 'utf8'))

		expect(file.EMAIL_FROM).toEndWith('@example.test>')
		expect(
			refusalMessage(() => checkEnvironment({ ...file, EMAIL_FROM: 'My Makeup <ne-pas-repondre@send.my-makeup.fr>' }))
		).toStartWith("EMAIL_FROM cite un domaine d'envoi réel (« send.my-makeup.fr »)")
	})

	test.each([
		['EMAIL_FROM', 'My Makeup <ne-pas-repondre@send.my-makeup.fr>', 'send.my-makeup.fr'],
		['MAILGUN_DOMAIN', 'mg.my-makeup.fr', 'mg.my-makeup.fr'],
		['SMTP_FROM', 'contact@MY-MAKEUP.FR', 'my-makeup.fr'],
	])('refuse le domaine d’envoi du site dans %s', (nom, valeur, domaine) => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, [nom]: valeur }))

		expect(message).toStartWith(`${nom} cite un domaine d'envoi réel (« ${domaine} »)`)
	})

	test('laisse passer un expéditeur dont le domaine réservé ressemble à celui du site', () => {
		expect(() => checkEnvironment({ ...BENCH, EMAIL_FROM: 'contact@my-makeup.fr.test' })).not.toThrow()
		expect(() => checkEnvironment({ ...BENCH, EMAIL_FROM: 'contact@not-my-makeup.fr' })).not.toThrow()
	})

	test('refuse un relais de mails qui n’est pas le capteur local', () => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, SMTP_HOST: 'smtp.resend.com' }))

		expect(message).toStartWith('SMTP_HOST refusé (« smtp.resend.com »)')
	})

	test.each([
		['un capteur distant', 'https://mailpit.example.test', '« mailpit.example.test »'],
		['une adresse sans protocole web', '127.0.0.1:8025', undefined],
	])('refuse %s dans MAILPIT_URL', (_cas, adresse, hote) => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, MAILPIT_URL: adresse }))

		expect(message).toStartWith('MAILPIT_URL')
		if (hote) expect(message).toContain(hote)
	})

	test.each([
		'my-makeup',
		'mymakeup-test-archive',
		'mymakeup_test',
	])('refuse un bucket dont le nom ne finit pas par -test : %s', bucket => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, S3_BUCKET: bucket }))

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
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, S3_ENDPOINT: adresse }))

		expect(message).toStartWith('S3_ENDPOINT')
		if (hote) expect(message).toContain(hote)
	})
})

describe('Connexion Google : refuse Google lui-même et tout identifiant Google qui ne se dit pas factice', () => {
	const withoutGoogle = Object.fromEntries(Object.entries(BENCH).filter(([name]) => !name.startsWith('GOOGLE_')))

	test('accepte le faux Google du banc et son client factice, et un environnement sans connexion Google', () => {
		expect(checkEnvironment(BENCH)).toBe('test')
		expect(checkEnvironment(withoutGoogle)).toBe('test')
		expect(checkEnvironment({ ...withoutGoogle, GOOGLE_OIDC_ISSUER: 'http://localhost:7219' })).toBe('test')
	})

	test.each([
		['Google lui-même', 'https://accounts.google.com', '« accounts.google.com »'],
		['un fournisseur distant', 'https://connexion.example.test', '« connexion.example.test »'],
		['un hôte qui commence comme un hôte local', 'http://127.0.0.1.example.test:7080', '« 127.0.0.1.example.test »'],
		['une adresse sans protocole web', '127.0.0.1:7080', undefined],
	])('refuse %s dans GOOGLE_OIDC_ISSUER', (_cas, adresse, hote) => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, GOOGLE_OIDC_ISSUER: adresse }))

		expect(message).toStartWith('GOOGLE_OIDC_ISSUER')
		if (hote) expect(message).toContain(`refusé (hôte ${hote}) : les tests ne parlent qu'au faux Google du banc`)
	})

	test.each([
		'GOOGLE_CLIENT_ID',
		'GOOGLE_CLIENT_SECRET',
	])('refuse %s réglé sans fournisseur : la connexion viserait Google lui-même', nom => {
		const message = refusalMessage(() =>
			checkEnvironment({ ...withoutGoogle, [nom]: BENCH[nom as keyof typeof BENCH] })
		)

		expect(message).toStartWith(
			`${nom} est réglé sans GOOGLE_OIDC_ISSUER : la connexion Google viserait Google lui-même.`
		)
	})

	test.each([
		['GOOGLE_CLIENT_ID', 'identifiant-temoin-sans-le-mot'],
		['GOOGLE_CLIENT_SECRET', 'valeur-temoin-sans-le-mot'],
	])('refuse dans %s une valeur qui ne se dit pas factice, sans la recopier', (nom, valeur) => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, [nom]: valeur }))

		expect(message).toBe(
			`${nom} refusé : sa valeur ne porte pas le mot « factice ». Les tests n'utilisent que le client factice du banc, jamais un vrai identifiant Google.`
		)
		expect(message).not.toContain('temoin')
	})

	test('arrête bun avant le premier test quand l’environnement vise Google lui-même', async () => {
		const { code, texte: text } = await launchSentinel({ ...BENCH, GOOGLE_OIDC_ISSUER: 'https://accounts.google.com' })

		expect(code).toBe(1)
		expect(text).toContain(
			'Tests arrêtés avant le premier test. GOOGLE_OIDC_ISSUER refusé (hôte « accounts.google.com »)'
		)
		expect(text).not.toContain(SENTINEL_MARK)
	})

	test('arrête bun avant le premier test sur un secret Google qui ne se dit pas factice, sans l’afficher', async () => {
		const { code, texte: text } = await launchSentinel({ ...BENCH, GOOGLE_CLIENT_SECRET: 'valeur-temoin-sans-le-mot' })

		expect(code).toBe(1)
		expect(text).toContain('Tests arrêtés avant le premier test. GOOGLE_CLIENT_SECRET refusé')
		expect(text).not.toContain('valeur-temoin-sans-le-mot')
		expect(text).not.toContain(SENTINEL_MARK)
	})
})

describe('Deux environnements reconnus : test, prod (toujours refusée)', () => {
	test('rien de déclaré vaut test, le plus strict', () => {
		expect(readEnvironment(undefined)).toBe('test')
		expect(readEnvironment('')).toBe('test')
	})

	test('test est admis', () => {
		expect(readEnvironment('test')).toBe('test')
	})

	test('prod est refusée même quand tout le reste est local', () => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, APP_ENV: 'prod' }))

		expect(message).toBe('APP_ENV vaut « prod » : aucun test ne tourne en environnement de prod.')
	})

	test.each(['production', 'dev', 'PROD', 'preprod', 'préprod'])('un environnement inconnu est refusé : %s', valeur => {
		expect(refusalMessage(() => readEnvironment(valeur))).toContain('environnement inconnu')
	})

	test('arrête bun avant le premier test quand l’environnement déclaré est prod', async () => {
		const { code, texte: text } = await launchSentinel({ ...BENCH, APP_ENV: 'prod' })

		expect(code).toBe(1)
		expect(text).toContain('Tests arrêtés avant le premier test. APP_ENV vaut « prod »')
		expect(text).not.toContain(SENTINEL_MARK)
	})
})

describe('La fausse base Strapi de l’import : STRAPI_SOURCE_URI locale, et en _test', () => {
	const SOURCE = 'postgres://lecture_strapi:mot-de-passe-factice-de-lecture@127.0.0.1:5443/strapi_source_test'

	test('accepte la source du banc, et un environnement sans source', () => {
		expect(checkEnvironment({ ...BENCH, STRAPI_SOURCE_URI: SOURCE })).toBe('test')
		expect(checkEnvironment(BENCH)).toBe('test')
		const file = readFileEnv(readFileSync(path.join(ROOT, '.env.test'), 'utf8'))
		expect(file.STRAPI_SOURCE_URI).toBe(SOURCE)
	})

	test.each([
		['hôte distant : la vraie base Strapi', 'postgres://lecture_strapi:x@db.example.test:5432/strapi_source_test'],
		['base qui ne finit pas par _test', 'postgres://lecture_strapi:x@127.0.0.1:5443/strapi'],
		['paramètre host qui détourne l’adresse', `${SOURCE}?host=db.example.test`],
	])('refuse : %s', (_cas, uri) => {
		expect(() => checkEnvironment({ ...BENCH, STRAPI_SOURCE_URI: uri })).toThrow(RefusedEnvironment)
	})

	test('le message nomme STRAPI_SOURCE_URI, jamais sa valeur', () => {
		const message = refusalMessage(() =>
			checkEnvironment({ ...BENCH, STRAPI_SOURCE_URI: `${SOURCE}?host=db.example.test` })
		)

		expect(message).toStartWith('Base refusée : STRAPI_SOURCE_URI porte un paramètre « host »')
		expect(message).not.toContain('mot-de-passe-factice')
		expect(refusalMessage(() => checkEnvironment({ ...BENCH, STRAPI_SOURCE_URI: 'strapi_source_test' }))).toBe(
			"STRAPI_SOURCE_URI n'est pas une adresse PostgreSQL lisible."
		)
	})

	test('arrête bun avant le premier test quand la source vise un hôte distant', async () => {
		const { code, texte: text } = await launchSentinel({
			...BENCH,
			STRAPI_SOURCE_URI: 'postgres://lecture_strapi:mot-de-passe-factice@db.example.test:5432/strapi_source_test',
		})

		expect(code).toBe(1)
		expect(text).toContain('Tests arrêtés avant le premier test. Base refusée : hôte « db.example.test »')
		expect(text).not.toContain('mot-de-passe-factice')
		expect(text).not.toContain(SENTINEL_MARK)
	})
})

describe('Ticket 233 : aucun test ne lance l’import à la demande', () => {
	test.each([
		'IMPORT_TOKEN',
		'IMPORT_MODE',
		'IMPORT_DECISIONS',
		'IMPORT_CONSENT_DATE',
		'IMPORT_CITIES',
		'IMPORT_TARGET_IN_SERVICE',
		'IMPORT_JETON',
		'IMPORT_CIBLE_EN_SERVICE',
		'IMPORT_COMMUNES',
		'IMPORT_CONSENTEMENT_LE',
	])('%s réglée : refusée, sans dire sa valeur', nom => {
		const message = refusalMessage(() => checkEnvironment({ ...BENCH, [nom]: 'valeur-temoin-233' }))

		expect(message).toContain(nom)
		expect(message).not.toContain('valeur-temoin-233')
	})

	test('une variable vide n’est pas réglée, et l’environnement du banc n’en porte aucune', () => {
		expect(checkEnvironment({ ...BENCH, IMPORT_TOKEN: '' })).toBe('test')
		expect(checkEnvironment({ ...BENCH, IMPORT_TOKEN: '  ' })).toBe('test')
		expect(Object.keys(BENCH).filter(nom => nom.startsWith('IMPORT_'))).toEqual([])
	})
})
