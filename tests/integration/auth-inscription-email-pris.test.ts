import { afterAll, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { createRateLimit, type RateLimit } from '@/lib/auth/rate-limit'
import { resendConfirmation } from '@/lib/auth/resend'
import { SIGN_UP_MESSAGES } from '@/lib/auth/sign-up'
import { SIGN_UP_FLOOR_MS, signUpAccount } from '@/lib/auth/sign-up-payload'
import type { MailboxRateLimits } from '@/lib/auth/sign-up-rate-limits'
import { envoiEmailDePayload } from '@/lib/emails/envoi'
import { serverEnv } from '@/lib/env'
import { purgeDesComptesNonConfirmes } from '@/lib/taches/comptes-non-confirmes'
import { attendreLeMail, mailsRecus, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * An address that already has an account (ticket 083; plan 02 E03, E04), the Gmail variants of an
 * address, and the purge of the accounts never confirmed (ticket 084). The page and the form are
 * played by tests/e2e/inscription.spec.ts.
 */

afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur()])
})

const MOT_DE_PASSE = 'aaaaaaaa'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'
const unique = () => crypto.randomUUID().slice(0, 8)
const courriel = (prefixe: string) => `${prefixe}-${crypto.randomUUID()}@example.test`

/** Brakes by mailbox on a clock the test moves. */
function freinsAvecHorloge(): { freins: MailboxRateLimits; avancer: (ms: number) => void } {
	let maintenant = Date.now()
	const monter = (frein: RateLimit): RateLimit => ({
		prendre: cle => frein.prendre(cle, maintenant),
		rendre: cle => frein.rendre(cle, maintenant),
		vider: () => frein.vider(),
	})
	const nom = crypto.randomUUID()
	return {
		freins: {
			parMinute: monter(createRateLimit({ nom: `minute-${nom}`, limite: 1, fenetreMs: 60_000 })),
			parJour: monter(createRateLimit({ nom: `jour-${nom}`, limite: 5, fenetreMs: 24 * 60 * 60 * 1000 })),
		},
		avancer: ms => {
			maintenant += ms
		},
	}
}
const freinsLarges = (): MailboxRateLimits => ({
	parMinute: createRateLimit({ nom: `larges-minute-${unique()}`, limite: 1000, fenetreMs: 60_000 }),
	parJour: createRateLimit({ nom: `larges-jour-${unique()}`, limite: 1000, fenetreMs: 60_000 }),
})

async function inscription(
	email: string,
	options: { plancherMs?: number; freins?: MailboxRateLimits; verifier?: boolean } = {}
) {
	const payload = await payloadDeTest()
	return signUpAccount({
		payload,
		donnees: { nom: 'Léa Fictive', email, password: MOT_DE_PASSE },
		verifier: options.verifier ?? true,
		envoyer: envoiEmailDePayload(payload, serverEnv()),
		site: SITE,
		journal: authLog(payload),
		plancherMs: options.plancherMs ?? 0,
		freins: options.freins ?? freinsLarges(),
	})
}

async function renvoi(email: string, freins: MailboxRateLimits) {
	const payload = await payloadDeTest()
	return resendConfirmation({
		payload,
		email,
		envoyer: envoiEmailDePayload(payload, serverEnv()),
		site: SITE,
		journal: authLog(payload),
		plancherMs: 0,
		freins,
	})
}

const comptes = async () => (await (await payloadDeTest()).count({ collection: 'pros' })).totalDocs
const profils = async () => (await (await payloadDeTest()).count({ collection: 'profiles' })).totalDocs
const journal = async () =>
	(await (await payloadDeTest()).find({ collection: 'auth-events', depth: 0, limit: 1000, sort: 'id' })).docs
const lienDuMail = (liens: string[]) => liens.find(l => l.includes('/auth/verification-complete'))
const mediane = (valeurs: number[]) => [...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)] ?? 0

describe('E03 : une adresse déjà utilisée ne révèle rien et ne crée pas de doublon', () => {
	test('même réponse que pour une adresse neuve, aucun second compte ni profil, et la vraie propriétaire, encore en attente, reçoit son lien de nouveau', async () => {
		const email = courriel('deja')
		const neuve = await inscription(email)
		await attendreLeMail({ pour: email })
		const [c, p, mails] = [await comptes(), await profils(), (await mailsRecus(email)).length]

		// Typed in capitals, by someone else, under another name.
		const doublon = await inscription(email.toUpperCase())

		expect(doublon).toEqual(neuve)
		expect(await comptes()).toBe(c)
		expect(await profils()).toBe(p)
		// Her account is still waiting: the mail she lost leaves again, with the same link.
		const recus = await mailsRecus(email)
		expect(recus.length).toBe(mails + 1)
		expect(lienDuMail(recus[1]?.liens ?? [])).toBe(lienDuMail(recus[0]?.liens ?? []))
	})

	test('un compte confirmé reçoit « tu as déjà un compte », sans lien de confirmation', async () => {
		const email = courriel('confirme-deux-fois')
		await inscription(email, { verifier: false })
		const [c, p] = [await comptes(), await profils()]

		const doublon = await inscription(email)

		expect(doublon).toEqual({ ok: true, confirmee: false })
		expect(await comptes()).toBe(c)
		expect(await profils()).toBe(p)
		const mail = await attendreLeMail({ pour: email })
		expect(mail.sujet).toContain('déjà un compte')
		expect(lienDuMail(mail.liens)).toBeUndefined()
		expect(mail.liens.some(l => l.endsWith('/auth/signin'))).toBe(true)
	})

	test('le journal garde le motif « email-deja-pris », sans adresse ni nom', async () => {
		const email = courriel('journal-pris')
		await inscription(email)
		const avant = (await journal()).length

		await inscription(email)

		const lignes = (await journal()).slice(avant)
		expect(lignes.map(({ type, code }) => [type, code])).toEqual([['sign-up', 'email-deja-pris']])
		expect(JSON.stringify(lignes)).not.toContain('journal-pris')
	})

	test('une adresse que Payload refuse pour sa forme n’est jamais dite « déjà utilisée » : la phrase du champ, aucun compte (ticket 224)', async () => {
		// The form checks the address first; this is what a rule of Payload that the form does not know would give.
		const payload = await payloadDeTest()
		const avant = (await payload.count({ collection: 'pros', overrideAccess: true })).totalDocs
		const resultat = await inscription('pas-une-adresse')

		expect(resultat).toEqual({
			ok: false,
			code: 'email-invalide',
			erreurs: { email: SIGN_UP_MESSAGES.email.invalide },
		})
		expect((await payload.count({ collection: 'pros', overrideAccess: true })).totalDocs).toBe(avant)
		expect((await journal()).map(({ type, code }) => [type, code]).at(-1)).toEqual(['sign-up', 'donnees-invalides'])
	})

	test('un mail de la propriétaire qui ne part pas donne la même réponse que pour une adresse neuve dont le mail ne part pas', async () => {
		const email = courriel('relais-en-feu')
		await inscription(email)
		const payload = await payloadDeTest()
		const enPanne = () => Promise.reject(new Error('relais en feu'))
		const appel = (adresse: string) =>
			signUpAccount({
				payload,
				donnees: { nom: 'Léa Fictive', email: adresse, password: MOT_DE_PASSE },
				verifier: true,
				envoyer: enPanne,
				site: SITE,
				plancherMs: 0,
				freins: freinsLarges(),
			})

		const pris = await appel(email)
		const neuf = await appel(courriel('neuve-en-panne'))

		expect(pris).toEqual({ ok: false, code: 'service-indisponible' })
		expect(neuf).toEqual(pris)
	})

	test('la confirmation coupée (AUTH_VERIFY=off) : la réponse honnête, car un compte neuf entrerait aussitôt', async () => {
		const email = courriel('sans-mur')
		await inscription(email, { verifier: false })

		expect(await inscription(email, { verifier: false })).toEqual({ ok: false, code: 'email-deja-pris' })
	})

	test('la durée de la réponse est la même, à 50 ms près, pour une adresse neuve ou prise', async () => {
		const prise = courriel('duree-prise')
		await inscription(prise)
		const mesurer = async (email: string) => {
			const debut = performance.now()
			await inscription(email, { plancherMs: SIGN_UP_FLOOR_MS })
			return performance.now() - debut
		}
		// Warm up (first connection, first render of the mail), then alternate the two cases.
		await mesurer(courriel('echauffement'))
		await mesurer(prise)
		const neuves: number[] = []
		const prises: number[] = []
		for (let i = 0; i < 5; i++) {
			neuves.push(await mesurer(courriel('duree-neuve')))
			prises.push(await mesurer(prise))
		}

		expect(Math.abs(mediane(neuves) - mediane(prises))).toBeLessThan(50)
		expect(Math.min(...neuves, ...prises)).toBeGreaterThanOrEqual(SIGN_UP_FLOOR_MS - 5)
	}, 60_000)

	test('une propriétaire submergée : au plus un mail « déjà un compte » par minute et par boîte', async () => {
		const email = courriel('submergee')
		const { freins, avancer } = freinsAvecHorloge()
		// A confirmed account (no mail, no place taken); the sign-ups that follow are on the wall's rules.
		await inscription(email, { verifier: false })
		const dejaUnCompte = async () => (await mailsRecus(email)).filter(m => m.sujet.includes('déjà un compte')).length

		await inscription(email, { freins })
		await inscription(email, { freins })
		await inscription(email, { freins })
		expect(await dejaUnCompte()).toBe(1)

		avancer(61_000)
		await inscription(email, { freins })
		expect(await dejaUnCompte()).toBe(2)
	})
})

describe('variantes Gmail : une boîte, un compte', () => {
	const local = () => `zz.fictif${unique()}`
	test('points, étiquette « + », googlemail.com et majuscules sont la même boîte que le compte existant', async () => {
		const base = local()
		const existant = `${base.replace('.', '')}@gmail.com`
		await inscription(existant, { verifier: false })
		const c = await comptes()
		const p = await profils()

		const variantes = [
			`${base}@gmail.com`,
			`${base}+promo@gmail.com`,
			`${base.replace('.', '')}@googlemail.com`,
			`${base.toUpperCase()}@GMAIL.COM`,
			`z.z.f.i.c.t.i.f${base.slice(base.indexOf('fictif') + 6)}+x@gmail.com`,
		]
		const reponses = []
		for (const variante of variantes) reponses.push(await inscription(variante))

		expect(reponses).toEqual(Array(variantes.length).fill({ ok: true, confirmee: false }))
		expect(await comptes()).toBe(c)
		expect(await profils()).toBe(p)
		// The real owner is told, at the address stored.
		expect((await mailsRecus(existant)).some(m => m.sujet.includes('déjà un compte'))).toBe(true)
	})

	test('l’inverse aussi : le compte existant porte les points, la variante n’en a pas', async () => {
		const base = `zz${unique()}`
		const existant = `${base.slice(0, 4)}.${base.slice(4)}@gmail.com`
		await inscription(existant)
		const c = await comptes()

		await inscription(`${base}@gmail.com`)

		expect(await comptes()).toBe(c)
	})

	test('ailleurs que chez Gmail, un point ou un « + » fait une autre boîte : le compte est créé', async () => {
		const base = unique()
		await inscription(`ab${base}@example.test`)
		const c = await comptes()

		const autre = await inscription(`a.b${base}@example.test`)
		const etiquette = await inscription(`ab${base}+x@example.test`)

		expect([autre, etiquette]).toEqual([
			{ ok: true, confirmee: false },
			{ ok: true, confirmee: false },
		])
		expect(await comptes()).toBe(c + 2)
	})
})

describe('E04 : le renvoi de la confirmation est limité', () => {
	test('un par minute, 5 par jour (l’inscription compte pour un), le même lien à chaque fois, et le jour suivant il repart', async () => {
		const email = courriel('renvoi')
		const { freins, avancer } = freinsAvecHorloge()
		await inscription(email, { freins })
		const premier = await attendreLeMail({ pour: email })
		const lien = lienDuMail(premier.liens)

		// The sign-up took the place of the minute: a resend at once is refused, one a minute later leaves.
		expect(await renvoi(email, freins)).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'minute' })
		for (let i = 2; i <= 5; i++) {
			avancer(61_000)
			expect(await renvoi(email, freins)).toEqual({ ok: true })
			expect(await renvoi(email, freins)).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'minute' })
		}
		const recus = await mailsRecus(email)
		expect(recus.length).toBe(5)
		expect(recus.every(m => lienDuMail(m.liens) === lien)).toBe(true)

		avancer(61_000)
		expect(await renvoi(email, freins)).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'jour' })
		expect((await mailsRecus(email)).length).toBe(5)

		avancer(24 * 60 * 60 * 1000)
		expect(await renvoi(email, freins)).toEqual({ ok: true })
		expect((await mailsRecus(email)).length).toBe(6)
	})

	test('l’inscription suivie du renvoi donne les mêmes réponses pour une adresse neuve et pour une adresse prise : pas d’oracle', async () => {
		const prise = courriel('oracle-prise')
		await inscription(prise)
		const neuve = courriel('oracle-neuve')
		const { freins, avancer } = freinsAvecHorloge()
		const { freins: freinsDeLaPrise, avancer: avancerLaPrise } = freinsAvecHorloge()
		// The taken address has an old account: its sign-up and resend run on their own clock.
		const sequence = async (email: string, f: MailboxRateLimits, avance: (ms: number) => void) => {
			const inscrite = await inscription(email, { freins: f })
			const premier = await renvoi(email, f)
			avance(61_000)
			const deuxieme = await renvoi(email, f)
			return [inscrite, premier, deuxieme]
		}

		const pourLaNeuve = await sequence(neuve, freins, avancer)
		const pourLaPrise = await sequence(prise, freinsDeLaPrise, avancerLaPrise)

		expect(pourLaNeuve[1]).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'minute' })
		expect(pourLaPrise).toEqual(pourLaNeuve)
	})

	test('un second formulaire sur un compte pas encore confirmé renvoie son lien, pas « connecte-toi »', async () => {
		const email = courriel('relance')
		const { freins, avancer } = freinsAvecHorloge()
		await inscription(email, { freins })
		const premier = await attendreLeMail({ pour: email })
		avancer(61_000)

		await inscription(email, { freins })

		const recus = await mailsRecus(email)
		expect(recus.length).toBe(2)
		expect(recus.every(m => !m.sujet.includes('déjà un compte'))).toBe(true)
		expect(lienDuMail(recus[1]?.liens ?? [])).toBe(lienDuMail(premier.liens))
	})

	test('même réponse, même limite, pour une adresse sans compte : rien ne part et rien ne se devine', async () => {
		const { freins, avancer } = freinsAvecHorloge()
		const inconnue = courriel('inconnue')

		expect(await renvoi(inconnue, freins)).toEqual({ ok: true })
		expect(await renvoi(inconnue, freins)).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'minute' })
		avancer(61_000)
		expect(await renvoi(inconnue, freins)).toEqual({ ok: true })
		expect(await mailsRecus(inconnue)).toEqual([])
	})

	test('un compte déjà confirmé reçoit « tu as déjà un compte », pas un lien de confirmation', async () => {
		const email = courriel('confirme')
		await inscription(email, { verifier: false })

		expect(await renvoi(email, freinsLarges())).toEqual({ ok: true })

		const mail = await attendreLeMail({ pour: email })
		expect(mail.sujet).toContain('déjà un compte')
		expect(lienDuMail(mail.liens)).toBeUndefined()
	})

	test('les variantes Gmail d’une adresse partagent la même limite', async () => {
		const base = `zz.renvoi${unique()}`
		const { freins, avancer } = freinsAvecHorloge()
		await inscription(`${base.replace('.', '')}@gmail.com`, { freins })
		avancer(61_000)

		expect(await renvoi(`${base.replace('.', '')}@gmail.com`, freins)).toEqual({ ok: true })
		expect(await renvoi(`${base}+x@gmail.com`, freins)).toMatchObject({ ok: false, code: 'trop-de-renvois' })
	})

	test('une adresse qui n’en est pas une est dite telle, sans rien compter', async () => {
		const { freins } = freinsAvecHorloge()

		expect(await renvoi('pas-une-adresse', freins)).toMatchObject({ ok: false, code: 'email-invalide' })
		expect(await renvoi('', freins)).toMatchObject({ ok: false, code: 'email-invalide' })
	})

	test('le journal : un « renvoi » par demande, avec son issue, sans adresse', async () => {
		const email = courriel('journal-renvoi')
		const { freins, avancer } = freinsAvecHorloge()
		await inscription(email, { freins })
		avancer(61_000)
		const avant = (await journal()).length

		await renvoi(email, freins)
		await renvoi(email, freins)
		avancer(61_000)
		await renvoi(email, freins)

		const lignes = (await journal()).slice(avant)
		expect(lignes.map(({ type, code }) => [type, code])).toEqual([
			['resend', 'ok'],
			['resend', 'trop-de-tentatives'],
			['resend', 'ok'],
		])
		expect(JSON.stringify(lignes)).not.toContain('journal-renvoi')
	})
})

describe('purge des comptes jamais confirmés (ticket 084)', () => {
	const joursAvant = (jours: number) => new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString()

	async function creer(options: {
		jours: number
		verifie?: boolean
		strapiId?: number
		legacyProvider?: string
		profilRempli?: boolean
	}) {
		const payload = await payloadDeTest()
		const compte = await payload.create({
			collection: 'pros',
			data: {
				email: courriel('purge'),
				password: MOT_DE_PASSE,
				name: 'Compte Fictif',
				_verified: options.verifie ?? false,
				createdAt: joursAvant(options.jours),
				...(options.strapiId !== undefined && { strapiId: options.strapiId }),
				...(options.legacyProvider !== undefined && { legacyProvider: options.legacyProvider }),
			},
			depth: 0,
			disableVerificationEmail: true,
			overrideAccess: true,
		})
		const profil = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
			.docs[0]
		if (options.profilRempli && profil)
			await payload.update({
				collection: 'profiles',
				id: profil.id,
				data: { specialty: 'Maquillage de mariée' },
				depth: 0,
				overrideAccess: true,
			})
		return { compte, profil }
	}
	const existe = async (collection: 'pros' | 'profiles', id: number) =>
		(await (await payloadDeTest()).count({ collection, where: { id: { equals: id } } })).totalDocs === 1

	test('un compte non confirmé de 8 jours part avec son profil vide ; tout le reste est gardé', async () => {
		const payload = await payloadDeTest()
		const perime = await creer({ jours: 8 })
		const recent = await creer({ jours: 6 })
		const confirme = await creer({ jours: 30, verifie: true })
		const importe = await creer({ jours: 30, strapiId: 910_001 })
		const ancienFournisseur = await creer({ jours: 30, legacyProvider: 'local' })
		const rempli = await creer({ jours: 30, profilRempli: true })
		expect(rempli.profil?.id).toBeDefined()

		const supprimes = await purgeDesComptesNonConfirmes.executer(payload, new Date())

		expect(supprimes).toBe(1)
		expect(await existe('pros', perime.compte.id)).toBe(false)
		expect(await existe('profiles', perime.profil?.id ?? 0)).toBe(false)
		for (const gardee of [recent, confirme, importe, ancienFournisseur, rempli]) {
			expect(await existe('pros', gardee.compte.id)).toBe(true)
			expect(await existe('profiles', gardee.profil?.id ?? 0)).toBe(true)
		}
	})

	test('la purge se rejoue sans effet, et le délai est de 7 jours pleins', async () => {
		const payload = await payloadDeTest()
		const limite = await creer({ jours: 7 })
		const juste = await creer({ jours: 6.9 })

		const premiere = await purgeDesComptesNonConfirmes.executer(payload, new Date())
		const seconde = await purgeDesComptesNonConfirmes.executer(payload, new Date())

		expect(premiere).toBeGreaterThanOrEqual(1)
		expect(seconde).toBe(0)
		expect(await existe('pros', limite.compte.id)).toBe(false)
		expect(await existe('pros', juste.compte.id)).toBe(true)
	})
})
