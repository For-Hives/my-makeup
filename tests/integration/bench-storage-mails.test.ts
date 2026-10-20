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
const CINQ_SECONDES_MS = 5000

const environnement = benchEnvironment()
/** The address the application of the bench is served from: where a link of a mail must lead. */
const SITE = environnement.NEXT_PUBLIC_SITE_URL ?? ''

/** An address of its own for each mail: a test only ever reads what it sent. */
const adresseFictive = (nom: string): string => `${nom}-${crypto.randomUUID()}@example.test`

const enTexte = (octets: Uint8Array): string => new TextDecoder().decode(octets)

/** A port of this machine nothing listens on: asked from the system, then given back. */
async function portFerme(): Promise<number> {
	const serveur = createServer()
	await new Promise<void>(resolve => serveur.listen(0, '127.0.0.1', resolve))
	const adresse = serveur.address()
	await new Promise(resolve => serveur.close(resolve))
	if (adresse === null || typeof adresse === 'string') throw new Error('aucun port libre')
	return adresse.port
}

/** The rejection of a promise, with how long it took to come. */
async function echec(essai: Promise<unknown>): Promise<{ erreur: unknown; dureeMs: number }> {
	const debut = performance.now()
	try {
		await essai
	} catch (erreur) {
		return { erreur, dureeMs: performance.now() - debut }
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
			const debut = performance.now()
			const payload = await testPayload()
			const compte = { email: adresseFictive('coquille'), password: crypto.randomUUID(), role: 'admin' as const }
			const cle = `coquille/${crypto.randomUUID()}.txt`
			const destinataire = adresseFictive('coquille-mail')

			const [document] = await Promise.all([
				payload.create({ collection: 'admins', data: compte }),
				dropObject(cle, 'Bonjour du banc', { type: 'text/plain; charset=utf-8' }),
				// The mail goes through the application itself: the adapter of Payload, set by the environment.
				payload.sendEmail({ to: destinataire, subject: 'Test coquille', text: `Bonjour : ${SITE}/auth` }),
			])

			const [documentRelu, objet, mail] = await Promise.all([
				payload.findByID({ collection: 'admins', id: document.id }),
				readObject(cle),
				waitMail({ pour: destinataire }),
			])

			expect(documentRelu.email).toBe(compte.email)
			expect(enTexte(objet?.octets ?? new Uint8Array())).toBe('Bonjour du banc')
			expect(mail.sujet).toBe('Test coquille')
			expect(performance.now() - debut).toBeLessThan(CINQ_SECONDES_MS)
		},
		CINQ_SECONDES_MS
	)

	test('le mail est lu avec son destinataire @example.test, son sujet et un lien extrait', async () => {
		const payload = await testPayload()
		const destinataire = adresseFictive('lea')
		const lien = `${SITE}/auth/verification?jeton=${crypto.randomUUID()}&retour=profil`

		await payload.sendEmail({
			to: `Léa Martin <${destinataire}>`,
			subject: 'Vérifie ton adresse email',
			// In HTML, the « & » of an address is written « &amp; »: the link is read as a browser reads it.
			html: `<p>Bonjour Léa,</p><p><a href="${lien.replace('&', '&amp;')}">Vérifier mon adresse</a></p><p><a href="mailto:contact@example.test">Nous écrire</a></p>`,
			text: `Bonjour Léa,\nouvre ce lien pour vérifier ton adresse : ${lien}\n`,
		})
		const mail = await waitMail({ pour: destinataire })

		expect(mail.destinataires).toEqual([{ nom: 'Léa Martin', adresse: destinataire }])
		expect(mail.destinataires[0]?.adresse).toEndWith('@example.test')
		expect(mail.sujet).toBe('Vérifie ton adresse email')
		// Once, though the HTML part and the text part both hold it; the « mailto: » is not a web link.
		expect(mail.liens).toEqual([lien])
		expect(mailLink(mail, '/auth/verification')).toBe(lien)
		expect(mail.texte).toBe(`Bonjour Léa,\nouvre ce lien pour vérifier ton adresse : ${lien}`)
		expect(mail.html).toContain('Vérifier mon adresse</a>')
	})

	test('l’application envoie par l’adaptateur de Payload réglé par l’environnement : le relais et l’expéditeur du banc', async () => {
		const payload = await testPayload()
		const destinataire = adresseFictive('expediteur')

		expect(payload.email.name).toBe('nodemailer')
		await payload.sendEmail({ to: destinataire, subject: 'Expéditeur du banc', text: 'Bonjour' })
		const mail = await waitMail({ pour: destinataire })

		// EMAIL_FROM of .env.test, and nothing a test gave: the sender comes from the environment.
		expect(environnement.EMAIL_FROM).toBe('My Makeup <ne-pas-repondre@example.test>')
		expect(mail.de).toEqual({ nom: 'My Makeup', adresse: 'ne-pas-repondre@example.test' })
		expect(mail.date.getTime()).toBeGreaterThan(Date.now() - 60_000)
	})
})

describe('Le capteur de mails : lire ce que l’application a envoyé', () => {
	test('un mail se cherche par son destinataire exact, en copie comme en copie cachée', async () => {
		const payload = await testPayload()
		const [principal, copie, cachee] = [adresseFictive('zoe'), adresseFictive('copie'), adresseFictive('cachee')]
		// Mailpit would find this one too when asked for `principal`: it matches a part of an address.
		const voisine = `voisine-${principal}`

		await payload.sendEmail({ to: principal, cc: copie, bcc: cachee, subject: 'Pour trois', text: 'Bonjour' })
		await payload.sendEmail({ to: voisine, subject: 'Pour la voisine', text: 'Bonjour' })

		for (const adresse of [principal, copie, cachee])
			expect({ adresse, sujets: (await mailReceived(adresse)).map(({ sujet }) => sujet) }).toEqual({
				adresse,
				sujets: ['Pour trois'],
			})
		expect((await mailReceived(principal.toUpperCase())).length).toBe(1)
		expect((await mailReceived(voisine)).map(({ sujet }) => sujet)).toEqual(['Pour la voisine'])
		expect(await mailReceived(adresseFictive('personne'))).toEqual([])
	})

	test('de plusieurs mails pour une adresse, le plus récent d’abord ; un sujet choisit le sien', async () => {
		const payload = await testPayload()
		const destinataire = adresseFictive('deux-mails')

		await payload.sendEmail({ to: destinataire, subject: 'Premier', text: 'Un' })
		// The second mail goes out once the first is in the catcher: the order never depends on the clock's resolution.
		await waitMail({ pour: destinataire, sujet: 'Premier' })
		await payload.sendEmail({ to: destinataire, subject: 'Second', text: 'Deux' })
		await waitMail({ pour: destinataire, sujet: 'Second' })

		expect((await mailReceived(destinataire)).map(({ sujet }) => sujet)).toEqual(['Second', 'Premier'])
		expect((await waitMail({ pour: destinataire })).sujet).toBe('Second')
		expect((await waitMail({ pour: destinataire, sujet: 'Premier' })).texte).toBe('Un')
		expect((await waitMail({ pour: destinataire, sujet: /^Sec/ })).texte).toBe('Deux')
	})

	test('un mail qui n’arrive pas : l’attente s’arrête à son délai et dit ce que l’adresse a reçu', async () => {
		const payload = await testPayload()
		const destinataire = adresseFictive('attente')
		const personne = adresseFictive('personne')
		await payload.sendEmail({ to: destinataire, subject: 'Bienvenue', text: 'Bonjour' })

		const sansMail = await echec(waitMail({ pour: personne }, { delaiMs: 300 }))
		const autreSujet = await echec(waitMail({ pour: destinataire, sujet: 'Au revoir' }, { delaiMs: 300 }))

		expect(sansMail.erreur).toEqual(
			new Error(
				`Aucun mail pour « ${personne} » dans le capteur de mails au bout de 0,3 s. Cette adresse n’en a reçu aucun.`
			)
		)
		expect(autreSujet.erreur).toEqual(
			new Error(
				`Aucun mail pour « ${destinataire} » dont le sujet soit « Au revoir » dans le capteur de mails au bout de 0,3 s. Cette adresse en a reçu 1, sous un autre sujet : « Bienvenue ».`
			)
		)
		expect(sansMail.dureeMs).toBeGreaterThanOrEqual(300)
		// The default wait and one request that gets no answer still end before 5 seconds.
		expect(WAITING_DELAY_MS).toBeLessThanOrEqual(3000)
	})

	test('la remise à zéro vide le capteur', async () => {
		const payload = await testPayload()
		const destinataire = adresseFictive('a-effacer')
		await payload.sendEmail({ to: destinataire, subject: 'À effacer', text: 'Bonjour' })
		expect(await countMails()).toBeGreaterThan(0)

		await emptySink()

		expect(await countMails()).toBe(0)
		expect(await mailReceived(destinataire)).toEqual([])
	})
})

describe('Capteur arrêté : une erreur lisible en moins de 5 secondes', () => {
	test('le client du capteur dit quel service ne répond pas, où, et la commande qui démarre le banc', async () => {
		const instance = readInstance()
		// Where nothing listens: what the address of the catcher is once its container is stopped.
		const arrete: Sink = { ...benchSink(), api: `http://127.0.0.1:${await portFerme()}` }
		const hote = new URL(arrete.api).host

		const essais = [
			waitMail({ pour: adresseFictive('personne') }, { capteur: arrete }),
			mailReceived(adresseFictive('personne'), { capteur: arrete }),
			countMails({ capteur: arrete }),
			emptySink({ capteur: arrete }),
		]
		for (const essai of essais) {
			const { erreur, dureeMs } = await echec(essai)

			expect(erreur).toBeInstanceOf(RefusedBench)
			expect((erreur as RefusedBench).message).toBe(
				`Le banc de test « ${instance.nom} » ne répond pas : capteur de mails (${hote}).\nDémarre-le d’abord : ${commandPrefix(instance)}bun run bench:up`
			)
			expect(dureeMs).toBeLessThan(CINQ_SECONDES_MS)
		}
	})
})

describe('Le stockage d’objets : déposer, relire, lister, supprimer', () => {
	test('un objet se relit octet pour octet, avec son type ; une clé absente ne rend rien', async () => {
		const dossier = `relire-${crypto.randomUUID()}`
		// Every value a byte can take: nothing is read as text on the way.
		const octets = Uint8Array.from({ length: 256 }, (_octet, rang) => rang)

		await dropObject(`${dossier}/tous-les-octets.bin`, octets, { type: 'image/webp' })
		const objet = await readObject(`${dossier}/tous-les-octets.bin`)

		expect(objet?.cle).toBe(`${dossier}/tous-les-octets.bin`)
		expect(objet?.type).toBe('image/webp')
		expect([...(objet?.octets ?? [])]).toEqual([...octets])
		expect(await readObject(`${dossier}/absent.bin`)).toBeUndefined()
	})

	test('une clé garde ses espaces, ses accents et ses signes ; déposer deux fois remplace', async () => {
		const dossier = `cles-${crypto.randomUUID()}`
		const cle = `${dossier}/photo d’été & portrait n°1 (100 %) + retouche?.txt`

		await dropObject(cle, 'première version', { type: 'text/plain' })
		await dropObject(cle, 'seconde version', { type: 'text/plain' })

		expect(enTexte((await readObject(cle))?.octets ?? new Uint8Array())).toBe('seconde version')
		expect(await listObjects(`${dossier}/`)).toEqual([{ cle, taille: 'seconde version'.length }])
	})

	test('la liste suit un préfixe et lit toutes les pages ; supprimer retire un objet et un seul', async () => {
		const dossier = `liste-${crypto.randomUUID()}`
		const cles = ['a.txt', 'b.txt', 'c.txt', 'sous-dossier/d.txt', 'sous-dossier/e.txt'].map(nom => `${dossier}/${nom}`)
		await Promise.all(cles.map(cle => dropObject(cle, cle)))
		await dropObject(`autre-${dossier}/f.txt`, 'ailleurs')

		// Two objects a page: three pages for five objects.
		expect((await listObjects(`${dossier}/`, { parPage: 2 })).map(({ cle }) => cle)).toEqual(cles)
		expect((await listObjects(`${dossier}/sous-dossier/`)).map(({ cle }) => cle)).toEqual(cles.slice(3))
		expect((await listObjects(`${dossier}/`))[0]).toEqual({ cle: cles[0] ?? '', taille: (cles[0] ?? '').length })

		await deleteObject(cles[1] ?? '')
		// A second time, and a key that never existed: not an error.
		await deleteObject(cles[1] ?? '')

		expect((await listObjects(`${dossier}/`)).map(({ cle }) => cle)).toEqual(cles.filter(cle => cle !== cles[1]))
		expect(await readObject(cles[1] ?? '')).toBeUndefined()
	})

	test('une clé qui sortirait de l’espace est refusée avant toute requête', async () => {
		for (const cle of ['', '/racine.txt', '../autre-espace/objet.txt', 'dossier/./objet.txt', 'dossier/..'])
			expect({ cle, erreur: (await echec(dropObject(cle, 'x'))).erreur }).toEqual({
				cle,
				erreur: new Error(
					'Clé d’objet refusée : elle ne peut être vide, ni commencer par « / », ni contenir un segment « . » ou « .. ».'
				),
			})
	})

	test('la remise à zéro vide l’espace et le garde', async () => {
		const stockage = benchStorage()
		await Promise.all(Array.from({ length: 25 }, (_objet, rang) => dropObject(`a-vider/${rang}.txt`, String(rang))))
		expect((await listObjects()).length).toBeGreaterThanOrEqual(25)

		await emptyStorage()

		expect(await listObjects()).toEqual([])
		// The bucket is still there: the next file writes in it without creating anything.
		expect((await fetch(`${stockage.adresse}/${stockage.bucket}`, { method: 'HEAD' })).status).toBe(200)
	})

	test('stockage arrêté : la même erreur lisible, en moins de 5 secondes', async () => {
		const instance = readInstance()
		const arrete = { ...benchStorage(), adresse: `http://127.0.0.1:${await portFerme()}` }

		const { erreur, dureeMs } = await echec(dropObject('objet.txt', 'x', { stockage: arrete }))

		expect(erreur).toBeInstanceOf(RefusedBench)
		expect((erreur as RefusedBench).message).toStartWith(
			`Le banc de test « ${instance.nom} » ne répond pas : stockage d’objets (${new URL(arrete.adresse).host}).\nDémarre-le d’abord : `
		)
		expect(dureeMs).toBeLessThan(CINQ_SECONDES_MS)
	})
})
