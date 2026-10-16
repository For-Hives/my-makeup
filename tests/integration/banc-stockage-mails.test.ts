import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { BancRefuse, environnementDuBanc, lireInstance, prefixeDeCommande } from '../outils/banc'
import {
	attendreLeMail,
	type Capteur,
	capteurDuBanc,
	compterLesMails,
	DELAI_D_ATTENTE_MS,
	lienDuMail,
	mailsRecus,
	viderLeCapteur,
} from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import {
	deposerUnObjet,
	lireUnObjet,
	listerLesObjets,
	stockageDuBanc,
	supprimerUnObjet,
	viderLeStockage,
} from '../outils/s3'

/** The criterion of the ticket, for a write or for an error: under 5 seconds. */
const CINQ_SECONDES_MS = 5000

const environnement = environnementDuBanc()
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
	await Promise.all([viderLeCapteur(), viderLeStockage()])
})
afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur(), viderLeStockage()])
})

describe('Test coquille : la base, le stockage d’objets et le capteur de mails du banc', () => {
	test(
		'écrit un document, un objet et un mail, puis relit les trois en moins de 5 secondes',
		async () => {
			const debut = performance.now()
			const payload = await payloadDeTest()
			const compte = { email: adresseFictive('coquille'), password: crypto.randomUUID(), role: 'admin' as const }
			const cle = `coquille/${crypto.randomUUID()}.txt`
			const destinataire = adresseFictive('coquille-mail')

			const [document] = await Promise.all([
				payload.create({ collection: 'admins', data: compte }),
				deposerUnObjet(cle, 'Bonjour du banc', { type: 'text/plain; charset=utf-8' }),
				// The mail goes through the application itself: the adapter of Payload, set by the environment.
				payload.sendEmail({ to: destinataire, subject: 'Test coquille', text: `Bonjour : ${SITE}/auth` }),
			])

			const [documentRelu, objet, mail] = await Promise.all([
				payload.findByID({ collection: 'admins', id: document.id }),
				lireUnObjet(cle),
				attendreLeMail({ pour: destinataire }),
			])

			expect(documentRelu.email).toBe(compte.email)
			expect(enTexte(objet?.octets ?? new Uint8Array())).toBe('Bonjour du banc')
			expect(mail.sujet).toBe('Test coquille')
			expect(performance.now() - debut).toBeLessThan(CINQ_SECONDES_MS)
		},
		CINQ_SECONDES_MS
	)

	test('le mail est lu avec son destinataire @example.test, son sujet et un lien extrait', async () => {
		const payload = await payloadDeTest()
		const destinataire = adresseFictive('lea')
		const lien = `${SITE}/auth/verification?jeton=${crypto.randomUUID()}&retour=profil`

		await payload.sendEmail({
			to: `Léa Martin <${destinataire}>`,
			subject: 'Vérifie ton adresse email',
			// In HTML, the « & » of an address is written « &amp; »: the link is read as a browser reads it.
			html: `<p>Bonjour Léa,</p><p><a href="${lien.replace('&', '&amp;')}">Vérifier mon adresse</a></p><p><a href="mailto:contact@example.test">Nous écrire</a></p>`,
			text: `Bonjour Léa,\nouvre ce lien pour vérifier ton adresse : ${lien}\n`,
		})
		const mail = await attendreLeMail({ pour: destinataire })

		expect(mail.destinataires).toEqual([{ nom: 'Léa Martin', adresse: destinataire }])
		expect(mail.destinataires[0]?.adresse).toEndWith('@example.test')
		expect(mail.sujet).toBe('Vérifie ton adresse email')
		// Once, though the HTML part and the text part both hold it; the « mailto: » is not a web link.
		expect(mail.liens).toEqual([lien])
		expect(lienDuMail(mail, '/auth/verification')).toBe(lien)
		expect(mail.texte).toBe(`Bonjour Léa,\nouvre ce lien pour vérifier ton adresse : ${lien}`)
		expect(mail.html).toContain('Vérifier mon adresse</a>')
	})

	test('l’application envoie par l’adaptateur de Payload réglé par l’environnement : le relais et l’expéditeur du banc', async () => {
		const payload = await payloadDeTest()
		const destinataire = adresseFictive('expediteur')

		expect(payload.email.name).toBe('nodemailer')
		await payload.sendEmail({ to: destinataire, subject: 'Expéditeur du banc', text: 'Bonjour' })
		const mail = await attendreLeMail({ pour: destinataire })

		// EMAIL_FROM of .env.test, and nothing a test gave: the sender comes from the environment.
		expect(environnement.EMAIL_FROM).toBe('My Makeup <ne-pas-repondre@example.test>')
		expect(mail.de).toEqual({ nom: 'My Makeup', adresse: 'ne-pas-repondre@example.test' })
		expect(mail.date.getTime()).toBeGreaterThan(Date.now() - 60_000)
	})
})

describe('Le capteur de mails : lire ce que l’application a envoyé', () => {
	test('un mail se cherche par son destinataire exact, en copie comme en copie cachée', async () => {
		const payload = await payloadDeTest()
		const [principal, copie, cachee] = [adresseFictive('zoe'), adresseFictive('copie'), adresseFictive('cachee')]
		// Mailpit would find this one too when asked for `principal`: it matches a part of an address.
		const voisine = `voisine-${principal}`

		await payload.sendEmail({ to: principal, cc: copie, bcc: cachee, subject: 'Pour trois', text: 'Bonjour' })
		await payload.sendEmail({ to: voisine, subject: 'Pour la voisine', text: 'Bonjour' })

		for (const adresse of [principal, copie, cachee])
			expect({ adresse, sujets: (await mailsRecus(adresse)).map(({ sujet }) => sujet) }).toEqual({
				adresse,
				sujets: ['Pour trois'],
			})
		expect((await mailsRecus(principal.toUpperCase())).length).toBe(1)
		expect((await mailsRecus(voisine)).map(({ sujet }) => sujet)).toEqual(['Pour la voisine'])
		expect(await mailsRecus(adresseFictive('personne'))).toEqual([])
	})

	test('de plusieurs mails pour une adresse, le plus récent d’abord ; un sujet choisit le sien', async () => {
		const payload = await payloadDeTest()
		const destinataire = adresseFictive('deux-mails')

		await payload.sendEmail({ to: destinataire, subject: 'Premier', text: 'Un' })
		// The second mail goes out once the first is in the catcher: the order never depends on the clock's resolution.
		await attendreLeMail({ pour: destinataire, sujet: 'Premier' })
		await payload.sendEmail({ to: destinataire, subject: 'Second', text: 'Deux' })
		await attendreLeMail({ pour: destinataire, sujet: 'Second' })

		expect((await mailsRecus(destinataire)).map(({ sujet }) => sujet)).toEqual(['Second', 'Premier'])
		expect((await attendreLeMail({ pour: destinataire })).sujet).toBe('Second')
		expect((await attendreLeMail({ pour: destinataire, sujet: 'Premier' })).texte).toBe('Un')
		expect((await attendreLeMail({ pour: destinataire, sujet: /^Sec/ })).texte).toBe('Deux')
	})

	test('un mail qui n’arrive pas : l’attente s’arrête à son délai et dit ce que l’adresse a reçu', async () => {
		const payload = await payloadDeTest()
		const destinataire = adresseFictive('attente')
		const personne = adresseFictive('personne')
		await payload.sendEmail({ to: destinataire, subject: 'Bienvenue', text: 'Bonjour' })

		const sansMail = await echec(attendreLeMail({ pour: personne }, { delaiMs: 300 }))
		const autreSujet = await echec(attendreLeMail({ pour: destinataire, sujet: 'Au revoir' }, { delaiMs: 300 }))

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
		expect(DELAI_D_ATTENTE_MS).toBeLessThanOrEqual(3000)
	})

	test('la remise à zéro vide le capteur', async () => {
		const payload = await payloadDeTest()
		const destinataire = adresseFictive('a-effacer')
		await payload.sendEmail({ to: destinataire, subject: 'À effacer', text: 'Bonjour' })
		expect(await compterLesMails()).toBeGreaterThan(0)

		await viderLeCapteur()

		expect(await compterLesMails()).toBe(0)
		expect(await mailsRecus(destinataire)).toEqual([])
	})
})

describe('Capteur arrêté : une erreur lisible en moins de 5 secondes', () => {
	test('le client du capteur dit quel service ne répond pas, où, et la commande qui démarre le banc', async () => {
		const instance = lireInstance()
		// Where nothing listens: what the address of the catcher is once its container is stopped.
		const arrete: Capteur = { ...capteurDuBanc(), api: `http://127.0.0.1:${await portFerme()}` }
		const hote = new URL(arrete.api).host

		const essais = [
			attendreLeMail({ pour: adresseFictive('personne') }, { capteur: arrete }),
			mailsRecus(adresseFictive('personne'), { capteur: arrete }),
			compterLesMails({ capteur: arrete }),
			viderLeCapteur({ capteur: arrete }),
		]
		for (const essai of essais) {
			const { erreur, dureeMs } = await echec(essai)

			expect(erreur).toBeInstanceOf(BancRefuse)
			expect((erreur as BancRefuse).message).toBe(
				`Le banc de test « ${instance.nom} » ne répond pas : capteur de mails (${hote}).\nDémarre-le d’abord : ${prefixeDeCommande(instance)}bun run banc:up`
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

		await deposerUnObjet(`${dossier}/tous-les-octets.bin`, octets, { type: 'image/webp' })
		const objet = await lireUnObjet(`${dossier}/tous-les-octets.bin`)

		expect(objet?.cle).toBe(`${dossier}/tous-les-octets.bin`)
		expect(objet?.type).toBe('image/webp')
		expect([...(objet?.octets ?? [])]).toEqual([...octets])
		expect(await lireUnObjet(`${dossier}/absent.bin`)).toBeUndefined()
	})

	test('une clé garde ses espaces, ses accents et ses signes ; déposer deux fois remplace', async () => {
		const dossier = `cles-${crypto.randomUUID()}`
		const cle = `${dossier}/photo d’été & portrait n°1 (100 %) + retouche?.txt`

		await deposerUnObjet(cle, 'première version', { type: 'text/plain' })
		await deposerUnObjet(cle, 'seconde version', { type: 'text/plain' })

		expect(enTexte((await lireUnObjet(cle))?.octets ?? new Uint8Array())).toBe('seconde version')
		expect(await listerLesObjets(`${dossier}/`)).toEqual([{ cle, taille: 'seconde version'.length }])
	})

	test('la liste suit un préfixe et lit toutes les pages ; supprimer retire un objet et un seul', async () => {
		const dossier = `liste-${crypto.randomUUID()}`
		const cles = ['a.txt', 'b.txt', 'c.txt', 'sous-dossier/d.txt', 'sous-dossier/e.txt'].map(nom => `${dossier}/${nom}`)
		await Promise.all(cles.map(cle => deposerUnObjet(cle, cle)))
		await deposerUnObjet(`autre-${dossier}/f.txt`, 'ailleurs')

		// Two objects a page: three pages for five objects.
		expect((await listerLesObjets(`${dossier}/`, { parPage: 2 })).map(({ cle }) => cle)).toEqual(cles)
		expect((await listerLesObjets(`${dossier}/sous-dossier/`)).map(({ cle }) => cle)).toEqual(cles.slice(3))
		expect((await listerLesObjets(`${dossier}/`))[0]).toEqual({ cle: cles[0] ?? '', taille: (cles[0] ?? '').length })

		await supprimerUnObjet(cles[1] ?? '')
		// A second time, and a key that never existed: not an error.
		await supprimerUnObjet(cles[1] ?? '')

		expect((await listerLesObjets(`${dossier}/`)).map(({ cle }) => cle)).toEqual(cles.filter(cle => cle !== cles[1]))
		expect(await lireUnObjet(cles[1] ?? '')).toBeUndefined()
	})

	test('une clé qui sortirait de l’espace est refusée avant toute requête', async () => {
		for (const cle of ['', '/racine.txt', '../autre-espace/objet.txt', 'dossier/./objet.txt', 'dossier/..'])
			expect({ cle, erreur: (await echec(deposerUnObjet(cle, 'x'))).erreur }).toEqual({
				cle,
				erreur: new Error(
					'Clé d’objet refusée : elle ne peut être vide, ni commencer par « / », ni contenir un segment « . » ou « .. ».'
				),
			})
	})

	test('la remise à zéro vide l’espace et le garde', async () => {
		const stockage = stockageDuBanc()
		await Promise.all(Array.from({ length: 25 }, (_objet, rang) => deposerUnObjet(`a-vider/${rang}.txt`, String(rang))))
		expect((await listerLesObjets()).length).toBeGreaterThanOrEqual(25)

		await viderLeStockage()

		expect(await listerLesObjets()).toEqual([])
		// The bucket is still there: the next file writes in it without creating anything.
		expect((await fetch(`${stockage.adresse}/${stockage.bucket}`, { method: 'HEAD' })).status).toBe(200)
	})

	test('stockage arrêté : la même erreur lisible, en moins de 5 secondes', async () => {
		const instance = lireInstance()
		const arrete = { ...stockageDuBanc(), adresse: `http://127.0.0.1:${await portFerme()}` }

		const { erreur, dureeMs } = await echec(deposerUnObjet('objet.txt', 'x', { stockage: arrete }))

		expect(erreur).toBeInstanceOf(BancRefuse)
		expect((erreur as BancRefuse).message).toStartWith(
			`Le banc de test « ${instance.nom} » ne répond pas : stockage d’objets (${new URL(arrete.adresse).host}).\nDémarre-le d’abord : `
		)
		expect(dureeMs).toBeLessThan(CINQ_SECONDES_MS)
	})
})
