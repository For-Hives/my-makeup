import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { benchEnvironment, commandPrefix, RefusedBench, readInstance } from '../support/bench'
import {
	benchSink,
	countMails,
	emptySink,
	mailLink,
	mailReceived,
	type Sink,
	WAITING_DELAY_MS,
	waitMail,
} from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { benchStorage, deleteObject, dropObject, emptyStorage, listObjects, readObject } from '../support/s3'

/** The criterion of the ticket, for a write or for an error: under 5 seconds. */
const FIVE_SECONDS_MS = 5000

const environment = benchEnvironment()
/** The address the application of the bench is served from: where a link of a mail must lead. */
const SITE = environment.NEXT_PUBLIC_SITE_URL ?? ''

/** An address of its own for each mail: a test only ever reads what it sent. */
const fictionalUrl = (nom: string): string => `${nom}-${crypto.randomUUID()}@example.test`

const asText = (octets: Uint8Array): string => new TextDecoder().decode(octets)

/** A port of this machine nothing listens on: asked from the system, then given back. */
async function closedPort(): Promise<number> {
	const server = createServer()
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
	const url = server.address()
	await new Promise(resolve => server.close(resolve))
	if (url === null || typeof url === 'string') throw new Error('aucun port libre')
	return url.port
}

/** The rejection of a promise, with how long it took to come. */
async function failure(essai: Promise<unknown>): Promise<{ erreur: unknown; dureeMs: number }> {
	const start = performance.now()
	try {
		await essai
	} catch (error) {
		return { erreur: error, dureeMs: performance.now() - start }
	}
	throw new Error('rien n’a échoué')
}

// The three services start empty, and are left empty for the next file.
beforeAll(async () => {
	await Promise.all([emptySink(), emptyStorage()])
})
afterAll(async () => {
	await Promise.all([emptyBase(), emptySink(), emptyStorage()])
})

describe('Test coquille : la base, le stockage d’objets et le capteur de mails du banc', () => {
	test(
		'écrit un document, un objet et un mail, puis relit les trois en moins de 5 secondes',
		async () => {
			const start = performance.now()
			const payload = await testPayload()
			const account = { email: fictionalUrl('coquille'), password: crypto.randomUUID(), role: 'admin' as const }
			const key = `coquille/${crypto.randomUUID()}.txt`
			const recipient = fictionalUrl('coquille-mail')

			const [document] = await Promise.all([
				payload.create({ collection: 'admins', data: account }),
				dropObject(key, 'Bonjour du banc', { type: 'text/plain; charset=utf-8' }),
				// The mail goes through the application itself: the adapter of Payload, set by the environment.
				payload.sendEmail({ to: recipient, subject: 'Test coquille', text: `Bonjour : ${SITE}/auth` }),
			])

			const [rereadDocument, object, mail] = await Promise.all([
				payload.findByID({ collection: 'admins', id: document.id }),
				readObject(key),
				waitMail({ pour: recipient }),
			])

			expect(rereadDocument.email).toBe(account.email)
			expect(asText(object?.octets ?? new Uint8Array())).toBe('Bonjour du banc')
			expect(mail.sujet).toBe('Test coquille')
			expect(performance.now() - start).toBeLessThan(FIVE_SECONDS_MS)
		},
		FIVE_SECONDS_MS
	)

	test('le mail est lu avec son destinataire @example.test, son sujet et un lien extrait', async () => {
		const payload = await testPayload()
		const recipient = fictionalUrl('lea')
		const link = `${SITE}/auth/verification?jeton=${crypto.randomUUID()}&retour=profil`

		await payload.sendEmail({
			to: `Léa Martin <${recipient}>`,
			subject: 'Vérifie ton adresse email',
			// In HTML, the « & » of an address is written « &amp; »: the link is read as a browser reads it.
			html: `<p>Bonjour Léa,</p><p><a href="${link.replace('&', '&amp;')}">Vérifier mon adresse</a></p><p><a href="mailto:contact@example.test">Nous écrire</a></p>`,
			text: `Bonjour Léa,\nouvre ce lien pour vérifier ton adresse : ${link}\n`,
		})
		const mail = await waitMail({ pour: recipient })

		expect(mail.destinataires).toEqual([{ nom: 'Léa Martin', adresse: recipient }])
		expect(mail.destinataires[0]?.adresse).toEndWith('@example.test')
		expect(mail.sujet).toBe('Vérifie ton adresse email')
		// Once, though the HTML part and the text part both hold it; the « mailto: » is not a web link.
		expect(mail.liens).toEqual([link])
		expect(mailLink(mail, '/auth/verification')).toBe(link)
		expect(mail.texte).toBe(`Bonjour Léa,\nouvre ce lien pour vérifier ton adresse : ${link}`)
		expect(mail.html).toContain('Vérifier mon adresse</a>')
	})

	test('l’application envoie par l’adaptateur de Payload réglé par l’environnement : le relais et l’expéditeur du banc', async () => {
		const payload = await testPayload()
		const recipient = fictionalUrl('expediteur')

		expect(payload.email.name).toBe('nodemailer')
		await payload.sendEmail({ to: recipient, subject: 'Expéditeur du banc', text: 'Bonjour' })
		const mail = await waitMail({ pour: recipient })

		// EMAIL_FROM of .env.test, and nothing a test gave: the sender comes from the environment.
		expect(environment.EMAIL_FROM).toBe('My Makeup <ne-pas-repondre@example.test>')
		expect(mail.de).toEqual({ nom: 'My Makeup', adresse: 'ne-pas-repondre@example.test' })
		expect(mail.date.getTime()).toBeGreaterThan(Date.now() - 60_000)
	})
})

describe('Le capteur de mails : lire ce que l’application a envoyé', () => {
	test('un mail se cherche par son destinataire exact, en copie comme en copie cachée', async () => {
		const payload = await testPayload()
		const [principal, copy, hidden] = [fictionalUrl('zoe'), fictionalUrl('copie'), fictionalUrl('cachee')]
		// Mailpit would find this one too when asked for `principal`: it matches a part of an address.
		const neighbour = `voisine-${principal}`

		await payload.sendEmail({ to: principal, cc: copy, bcc: hidden, subject: 'Pour trois', text: 'Bonjour' })
		await payload.sendEmail({ to: neighbour, subject: 'Pour la voisine', text: 'Bonjour' })

		for (const url of [principal, copy, hidden])
			expect({ adresse: url, sujets: (await mailReceived(url)).map(({ sujet }) => sujet) }).toEqual({
				adresse: url,
				sujets: ['Pour trois'],
			})
		expect((await mailReceived(principal.toUpperCase())).length).toBe(1)
		expect((await mailReceived(neighbour)).map(({ sujet }) => sujet)).toEqual(['Pour la voisine'])
		expect(await mailReceived(fictionalUrl('personne'))).toEqual([])
	})

	test('de plusieurs mails pour une adresse, le plus récent d’abord ; un sujet choisit le sien', async () => {
		const payload = await testPayload()
		const recipient = fictionalUrl('deux-mails')

		await payload.sendEmail({ to: recipient, subject: 'Premier', text: 'Un' })
		// The second mail goes out once the first is in the catcher: the order never depends on the clock's resolution.
		await waitMail({ pour: recipient, sujet: 'Premier' })
		await payload.sendEmail({ to: recipient, subject: 'Second', text: 'Deux' })
		await waitMail({ pour: recipient, sujet: 'Second' })

		expect((await mailReceived(recipient)).map(({ sujet }) => sujet)).toEqual(['Second', 'Premier'])
		expect((await waitMail({ pour: recipient })).sujet).toBe('Second')
		expect((await waitMail({ pour: recipient, sujet: 'Premier' })).texte).toBe('Un')
		expect((await waitMail({ pour: recipient, sujet: /^Sec/ })).texte).toBe('Deux')
	})

	test('un mail qui n’arrive pas : l’attente s’arrête à son délai et dit ce que l’adresse a reçu', async () => {
		const payload = await testPayload()
		const recipient = fictionalUrl('attente')
		const person = fictionalUrl('personne')
		await payload.sendEmail({ to: recipient, subject: 'Bienvenue', text: 'Bonjour' })

		const withoutMail = await failure(waitMail({ pour: person }, { delaiMs: 300 }))
		const otherSubject = await failure(waitMail({ pour: recipient, sujet: 'Au revoir' }, { delaiMs: 300 }))

		expect(withoutMail.erreur).toEqual(
			new Error(
				`Aucun mail pour « ${person} » dans le capteur de mails au bout de 0,3 s. Cette adresse n’en a reçu aucun.`
			)
		)
		expect(otherSubject.erreur).toEqual(
			new Error(
				`Aucun mail pour « ${recipient} » dont le sujet soit « Au revoir » dans le capteur de mails au bout de 0,3 s. Cette adresse en a reçu 1, sous un autre sujet : « Bienvenue ».`
			)
		)
		expect(withoutMail.dureeMs).toBeGreaterThanOrEqual(300)
		// The default wait and one request that gets no answer still end before 5 seconds.
		expect(WAITING_DELAY_MS).toBeLessThanOrEqual(3000)
	})

	test('la remise à zéro vide le capteur', async () => {
		const payload = await testPayload()
		const recipient = fictionalUrl('a-effacer')
		await payload.sendEmail({ to: recipient, subject: 'À effacer', text: 'Bonjour' })
		expect(await countMails()).toBeGreaterThan(0)

		await emptySink()

		expect(await countMails()).toBe(0)
		expect(await mailReceived(recipient)).toEqual([])
	})
})

describe('Capteur arrêté : une erreur lisible en moins de 5 secondes', () => {
	test('le client du capteur dit quel service ne répond pas, où, et la commande qui démarre le banc', async () => {
		const instance = readInstance()
		// Where nothing listens: what the address of the catcher is once its container is stopped.
		const stopped: Sink = { ...benchSink(), api: `http://127.0.0.1:${await closedPort()}` }
		const host = new URL(stopped.api).host

		const tests = [
			waitMail({ pour: fictionalUrl('personne') }, { capteur: stopped }),
			mailReceived(fictionalUrl('personne'), { capteur: stopped }),
			countMails({ capteur: stopped }),
			emptySink({ capteur: stopped }),
		]
		for (const test of tests) {
			const { erreur: error, dureeMs: durationMs } = await failure(test)

			expect(error).toBeInstanceOf(RefusedBench)
			expect((error as RefusedBench).message).toBe(
				`Le banc de test « ${instance.nom} » ne répond pas : capteur de mails (${host}).\nDémarre-le d’abord : ${commandPrefix(instance)}bun run bench:up`
			)
			expect(durationMs).toBeLessThan(FIVE_SECONDS_MS)
		}
	})
})

describe('Le stockage d’objets : déposer, relire, lister, supprimer', () => {
	test('un objet se relit octet pour octet, avec son type ; une clé absente ne rend rien', async () => {
		const folder = `relire-${crypto.randomUUID()}`
		// Every value a byte can take: nothing is read as text on the way.
		const bytes = Uint8Array.from({ length: 256 }, (_octet, rang) => rang)

		await dropObject(`${folder}/tous-les-octets.bin`, bytes, { type: 'image/webp' })
		const object = await readObject(`${folder}/tous-les-octets.bin`)

		expect(object?.cle).toBe(`${folder}/tous-les-octets.bin`)
		expect(object?.type).toBe('image/webp')
		expect([...(object?.octets ?? [])]).toEqual([...bytes])
		expect(await readObject(`${folder}/absent.bin`)).toBeUndefined()
	})

	test('une clé garde ses espaces, ses accents et ses signes ; déposer deux fois remplace', async () => {
		const folder = `cles-${crypto.randomUUID()}`
		const key = `${folder}/photo d’été & portrait n°1 (100 %) + retouche?.txt`

		await dropObject(key, 'première version', { type: 'text/plain' })
		await dropObject(key, 'seconde version', { type: 'text/plain' })

		expect(asText((await readObject(key))?.octets ?? new Uint8Array())).toBe('seconde version')
		expect(await listObjects(`${folder}/`)).toEqual([{ cle: key, taille: 'seconde version'.length }])
	})

	test('la liste suit un préfixe et lit toutes les pages ; supprimer retire un objet et un seul', async () => {
		const folder = `liste-${crypto.randomUUID()}`
		const keys = ['a.txt', 'b.txt', 'c.txt', 'sous-dossier/d.txt', 'sous-dossier/e.txt'].map(nom => `${folder}/${nom}`)
		await Promise.all(keys.map(cle => dropObject(cle, cle)))
		await dropObject(`autre-${folder}/f.txt`, 'ailleurs')

		// Two objects a page: three pages for five objects.
		expect((await listObjects(`${folder}/`, { parPage: 2 })).map(({ cle: key }) => key)).toEqual(keys)
		expect((await listObjects(`${folder}/sous-dossier/`)).map(({ cle: key }) => key)).toEqual(keys.slice(3))
		expect((await listObjects(`${folder}/`))[0]).toEqual({ cle: keys[0] ?? '', taille: (keys[0] ?? '').length })

		await deleteObject(keys[1] ?? '')
		// A second time, and a key that never existed: not an error.
		await deleteObject(keys[1] ?? '')

		expect((await listObjects(`${folder}/`)).map(({ cle: key }) => key)).toEqual(keys.filter(cle => cle !== keys[1]))
		expect(await readObject(keys[1] ?? '')).toBeUndefined()
	})

	test('une clé qui sortirait de l’espace est refusée avant toute requête', async () => {
		for (const key of ['', '/racine.txt', '../autre-espace/objet.txt', 'dossier/./objet.txt', 'dossier/..'])
			expect({ cle: key, erreur: (await failure(dropObject(key, 'x'))).erreur }).toEqual({
				cle: key,
				erreur: new Error(
					'Clé d’objet refusée : elle ne peut être vide, ni commencer par « / », ni contenir un segment « . » ou « .. ».'
				),
			})
	})

	test('la remise à zéro vide l’espace et le garde', async () => {
		const storage = benchStorage()
		await Promise.all(Array.from({ length: 25 }, (_objet, rang) => dropObject(`a-vider/${rang}.txt`, String(rang))))
		expect((await listObjects()).length).toBeGreaterThanOrEqual(25)

		await emptyStorage()

		expect(await listObjects()).toEqual([])
		// The bucket is still there: the next file writes in it without creating anything.
		expect((await fetch(`${storage.adresse}/${storage.bucket}`, { method: 'HEAD' })).status).toBe(200)
	})

	test('stockage arrêté : la même erreur lisible, en moins de 5 secondes', async () => {
		const instance = readInstance()
		const stopped = { ...benchStorage(), adresse: `http://127.0.0.1:${await closedPort()}` }

		const { erreur: error, dureeMs: durationMs } = await failure(dropObject('objet.txt', 'x', { stockage: stopped }))

		expect(error).toBeInstanceOf(RefusedBench)
		expect((error as RefusedBench).message).toStartWith(
			`Le banc de test « ${instance.nom} » ne répond pas : stockage d’objets (${new URL(stopped.adresse).host}).\nDémarre-le d’abord : `
		)
		expect(durationMs).toBeLessThan(FIVE_SECONDS_MS)
	})
})
