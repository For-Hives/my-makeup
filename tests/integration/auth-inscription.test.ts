import { afterAll, describe, expect, test } from 'bun:test'
import { confirmerLEmail } from '@/lib/auth/confirmation'
import { connecter } from '@/lib/auth/connexion'
import { creerFrein } from '@/lib/auth/frein'
import type { FreinsDeBoite } from '@/lib/auth/freins-inscription'
import { inscrire } from '@/lib/auth/inscription-payload'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { journalDe } from '@/lib/auth/journal'
import { EnvoiEmailEchoue, envoiEmailDePayload } from '@/lib/emails/envoi'
import { parseServerEnv, serverEnv } from '@/lib/env'
import { creerCompte } from '../outils/fabrique-comptes'
import { attendreLeMail, mailsRecus, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The sign-up and the confirmation of the email (ticket 082; plan 02 I08). The page, the cookie and
 * the whole path through a browser are played by tests/e2e/inscription.spec.ts.
 */

afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur()])
})

const MOT_DE_PASSE = 'aaaaaaaa'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'
const frein = creerFrein({ nom: 'essai-inscription', limite: 1000, fenetreMs: 60_000 })
let n = 0
// The sign-ups of this file are many and fast: no floor, and brakes by mailbox wide open unless a test says otherwise.
const largesFreins = (): FreinsDeBoite => ({
	parMinute: creerFrein({ nom: `essai-boite-minute-${crypto.randomUUID()}`, limite: 1000, fenetreMs: 60_000 }),
	parJour: creerFrein({ nom: `essai-boite-jour-${crypto.randomUUID()}`, limite: 1000, fenetreMs: 60_000 }),
})
const adresse = () => new Headers({ 'x-forwarded-for': `192.0.2.${150 + (n++ % 90)}` })
const courriel = (prefixe: string) => `${prefixe}-${crypto.randomUUID()}@example.test`

async function inscription(options: {
	email?: string
	nom?: string
	verifier?: boolean
	envoyer?: Parameters<typeof inscrire>[0]['envoyer']
	plancherMs?: number
	freins?: FreinsDeBoite
}) {
	const payload = await payloadDeTest()
	const email = options.email ?? courriel('nouvelle')
	const resultat = await inscrire({
		payload,
		donnees: { nom: options.nom ?? 'Léa Fictive', email, password: MOT_DE_PASSE },
		verifier: options.verifier ?? true,
		envoyer: options.envoyer ?? envoiEmailDePayload(payload, serverEnv()),
		site: SITE,
		journal: journalDe(payload),
		plancherMs: options.plancherMs ?? 0,
		freins: options.freins ?? largesFreins(),
	})
	return { resultat, email, payload }
}

async function seConnecter(email: string, password: string) {
	const payload = await payloadDeTest()
	return connecter({
		ouvrir: data => ouvrirParMotDePasse(payload, 'pros', data),
		headers: adresse(),
		email,
		password,
		frein,
		journal: journalDe(payload),
	})
}

const compte = async (email: string) => {
	const payload = await payloadDeTest()
	return (await payload.find({ collection: 'pros', depth: 0, limit: 1, where: { email: { equals: email } } })).docs[0]
}

const journal = async () =>
	(await (await payloadDeTest()).find({ collection: 'auth-evenements', depth: 0, limit: 1000, sort: 'id' })).docs

const codeDuLien = (lien: string): string => new URL(lien).searchParams.get('code') ?? ''

describe('I08 : l’inscription envoie le mail de confirmation, et le compte attend le lien', () => {
	test('compte non confirmé, profil vide avec son slug fait par le serveur, un mail avec le lien', async () => {
		const { resultat, email } = await inscription({ nom: 'Léa Fictive' })

		expect(resultat).toEqual({ ok: true, confirmee: false })
		const pro = await compte(email)
		expect(pro?._verified).toBe(false)
		expect(pro?.nom).toBe('Léa Fictive')
		const payload = await payloadDeTest()
		const profils = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: pro?.id } } })
		expect(profils.totalDocs).toBe(1)
		expect(profils.docs[0]?.slug).toMatch(/^lea-fictive(-\d+)?$/)
		const mail = await attendreLeMail({ pour: email })
		expect(mail.sujet).toContain('Confirme ton adresse email')
		const lien = mail.liens.find(l => l.includes('/auth/verification-complete'))
		expect(lien).toStartWith(`${SITE}/auth/verification-complete?code=`)
		expect(codeDuLien(lien ?? '')).toMatch(/^[0-9a-f]{40}$/)
		expect(mail.texte).toContain(lien ?? 'x')
		expect(mail.liens.some(l => l.includes('/admin'))).toBe(false)
	})

	test('le mot de passe n’est dans aucun mail ni dans la base en clair', async () => {
		const { email } = await inscription({})
		const mail = await attendreLeMail({ pour: email })
		expect(mail.texte + mail.html).not.toContain(MOT_DE_PASSE)
		const pro = await compte(email)
		expect(JSON.stringify(pro)).not.toContain(MOT_DE_PASSE)
	})

	test('deux maquilleuses peuvent porter le même nom : deux comptes, deux slugs', async () => {
		const a = await inscription({ nom: 'Marie Homonyme' })
		const b = await inscription({ nom: 'Marie Homonyme' })
		expect(a.resultat.ok && b.resultat.ok).toBe(true)
		const payload = await payloadDeTest()
		const slugs = (
			await payload.find({
				collection: 'profils',
				depth: 0,
				where: { pro: { in: [(await compte(a.email))?.id, (await compte(b.email))?.id] } },
			})
		).docs.map(({ slug }) => slug)
		expect(new Set(slugs).size).toBe(2)
	})
})

describe('des homonymes qui s’inscrivent au même instant', () => {
	/** More than the 5 connections of the pool, and more than the 3 tries the sign-up had (CI of 15/10/2026). */
	const HOMONYMES = 8

	test('tous aboutissent, chacun avec son propre slug', async () => {
		const toutes = await Promise.all(
			Array.from({ length: HOMONYMES }, () => inscription({ nom: 'Homonyme Simultanée', verifier: false }))
		)

		expect(toutes.map(({ resultat }) => resultat.ok)).toEqual(Array(HOMONYMES).fill(true))
		const payload = await payloadDeTest()
		const pros = await Promise.all(toutes.map(({ email }) => compte(email)))
		const slugs = (
			await payload.find({ collection: 'profils', depth: 0, where: { pro: { in: pros.map(p => p?.id) } } })
		).docs.map(({ slug }) => slug)
		expect(new Set(slugs).size).toBe(HOMONYMES)
	})
})

describe('l’interrupteur d’exploitation : AUTH_VERIFY', () => {
	const base = { DATABASE_URI: process.env.DATABASE_URI, PAYLOAD_SECRET: process.env.PAYLOAD_SECRET }

	test('par défaut (variable absente ou « on ») la confirmation est demandée', async () => {
		for (const AUTH_VERIFY of [undefined, 'on']) {
			const env = parseServerEnv({ ...base, AUTH_VERIFY })
			const { resultat, email } = await inscription({ verifier: env.authVerify })
			expect(resultat).toEqual({ ok: true, confirmee: false })
			expect((await compte(email))?._verified).toBe(false)
			await attendreLeMail({ pour: email })
		}
	})

	test('« off » : le compte est confirmé sur le champ, il se connecte aussitôt, aucun mail ne part', async () => {
		const env = parseServerEnv({ ...base, AUTH_VERIFY: 'off' })
		const { resultat, email } = await inscription({ verifier: env.authVerify })

		expect(resultat).toEqual({ ok: true, confirmee: true })
		expect((await compte(email))?._verified).toBe(true)
		expect((await seConnecter(email, MOT_DE_PASSE)).ok).toBe(true)
		expect(await mailsRecus(email)).toEqual([])
	})
})

describe('connexion avant confirmation', () => {
	test('avec le bon mot de passe : le message dédié ; avec un mauvais ou une adresse inconnue : le message générique', async () => {
		const { email } = await inscription({})

		expect(await seConnecter(email, MOT_DE_PASSE)).toEqual({ ok: false, code: 'email-non-confirme' })
		expect(await seConnecter(email, 'mauvais-mot-de-passe')).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(await seConnecter(courriel('inconnue'), MOT_DE_PASSE)).toEqual({
			ok: false,
			code: 'identifiants-invalides',
		})
	})

	test('par l’API REST aussi : refusé, sans session ; la ligne du journal dit « email-non-confirme »', async () => {
		const { email } = await inscription({})
		const avant = (await journal()).length

		const reponse = await appelerRest('POST', '/api/pros/login', {
			corps: { email, password: MOT_DE_PASSE },
			enTetes: { 'x-forwarded-for': '198.51.100.230' },
		})

		expect(reponse.statut).toBe(403)
		expect(reponse.enTetes.get('set-cookie') ?? '').not.toContain('payload-token=')
		expect((await journal()).slice(avant).map(({ type, code }) => [type, code])).toEqual([
			['connexion', 'email-non-confirme'],
		])
	})

	test('un refus « non confirmé » rend sa place au frein : ce n’est pas un essai de mot de passe', async () => {
		const { email } = await inscription({})
		const petitFrein = creerFrein({ nom: 'essai-non-confirme', limite: 2, fenetreMs: 60_000 })
		const payload = await payloadDeTest()
		const essayer = () =>
			connecter({
				ouvrir: data => ouvrirParMotDePasse(payload, 'pros', data),
				headers: adresse(),
				email,
				password: MOT_DE_PASSE,
				frein: petitFrein,
			})
		const codes = []
		for (let i = 0; i < 5; i++) codes.push((await essayer()).ok ? 'ok' : 'non-confirme')
		expect(codes).toEqual(Array(5).fill('non-confirme'))
	})
})

describe('le lien du mail : à usage unique', () => {
	test('le lien confirme le compte ; suivi une seconde fois il dit « déjà confirmé » et ne change rien ; la connexion marche', async () => {
		const { email } = await inscription({})
		const mail = await attendreLeMail({ pour: email })
		const code = codeDuLien(mail.liens.find(l => l.includes('verification-complete')) ?? '')
		const payload = await payloadDeTest()
		const avant = (await journal()).length

		expect(await confirmerLEmail(payload, code, journalDe(payload))).toBe('ok')
		expect((await compte(email))?._verified).toBe(true)
		expect(await confirmerLEmail(payload, code, journalDe(payload))).toBe('deja-confirme')
		expect(await confirmerLEmail(payload, 'f'.repeat(40), journalDe(payload))).toBe('lien-invalide')

		expect((await seConnecter(email, MOT_DE_PASSE)).ok).toBe(true)
		expect((await journal()).slice(avant).map(({ type, code }) => [type, code])).toEqual([
			['confirmation', 'ok'],
			['confirmation', 'deja-confirme'],
			['confirmation', 'lien-invalide'],
			['connexion', 'ok'],
		])
	})

	test('le jeton ne reste pas en base : une trace de son usage, jamais un lien qui marche', async () => {
		const { email } = await inscription({})
		const mail = await attendreLeMail({ pour: email })
		const code = codeDuLien(mail.liens.find(l => l.includes('verification-complete')) ?? '')
		const payload = await payloadDeTest()
		await confirmerLEmail(payload, code)

		const ligne = await payload.db.findOne<{ id: number; _verificationToken?: string }>({
			collection: 'pros',
			where: { email: { equals: email } },
		})
		expect(ligne?._verificationToken).toStartWith('utilise:')
		expect(ligne?._verificationToken).not.toContain(code)
	})

	test('le lien d’un compte ne confirme pas celui d’un autre', async () => {
		const [a, b] = [await inscription({}), await inscription({})]
		const mailA = await attendreLeMail({ pour: a.email })
		const payload = await payloadDeTest()

		await confirmerLEmail(payload, codeDuLien(mailA.liens.find(l => l.includes('verification-complete')) ?? ''))

		expect((await compte(a.email))?._verified).toBe(true)
		expect((await compte(b.email))?._verified).toBe(false)
	})

	test('l’API REST ne donne jamais le jeton de confirmation, même à la propriétaire', async () => {
		const maquilleuse = await creerCompte('maquilleuse')
		const { corps, texte } = await appelerRest('GET', `/api/pros/${maquilleuse.id}`, {
			enTetes: maquilleuse.session.enTetes,
		})
		expect(corps).not.toHaveProperty('_verificationToken')
		expect(texte).not.toContain('_verificationToken')
	})
})

describe('quand l’inscription ne peut pas aboutir', () => {
	test('le mail ne part pas : rien n’est gardé (ni compte, ni profil), et elle peut réessayer avec la même adresse', async () => {
		const email = courriel('retente')
		const payload = await payloadDeTest()
		const profils = (await payload.count({ collection: 'profils' })).totalDocs

		const raté = await inscription({ email, envoyer: () => Promise.reject(new EnvoiEmailEchoue()) })

		expect(raté.resultat).toEqual({ ok: false, code: 'email-non-envoye' })
		expect(await compte(email)).toBeUndefined()
		expect((await payload.count({ collection: 'profils' })).totalDocs).toBe(profils)
		const nouvelle = await inscription({ email })
		expect(nouvelle.resultat).toEqual({ ok: true, confirmee: false })
		await attendreLeMail({ pour: email })
	})

	test('une panne imprévue donne « service-indisponible », jamais une exception', async () => {
		const { resultat } = await inscription({ envoyer: () => Promise.reject(new Error('relais en feu')) })
		expect(resultat).toEqual({ ok: false, code: 'service-indisponible' })
	})
})

describe('le journal de l’inscription', () => {
	test('une ligne « inscription » pour chaque issue, sans email ni nom', async () => {
		const avant = (await journal()).length
		const nom = 'Nom Distinctif Journal'
		const email = courriel('journal')
		await inscription({ email, nom })
		await inscription({ email, nom })
		await inscription({ envoyer: () => Promise.reject(new EnvoiEmailEchoue()) })

		const lignes = (await journal()).slice(avant)
		expect(lignes.map(({ type, code }) => [type, code])).toEqual([
			['inscription', 'ok'],
			['inscription', 'email-deja-pris'],
			['inscription', 'service-indisponible'],
		])
		expect(JSON.stringify(lignes)).not.toMatch(/Distinctif|journal-/)
	})
})

describe('l’admin qui crée un compte dans le panneau', () => {
	test('le mail de Payload dit la même chose et mène à la page du site, pas à l’administration', async () => {
		const admin = await creerCompte('admin')
		const email = courriel('par-admin')

		const reponse = await appelerRest('POST', '/api/pros', {
			enTetes: admin.session.enTetes,
			corps: { email, password: MOT_DE_PASSE, nom: 'Créée Par Admin' },
		})

		expect(reponse.statut).toBe(201)
		const mail = await attendreLeMail({ pour: email })
		expect(mail.sujet).toContain('Confirme ton adresse email')
		const lien = mail.liens.find(l => l.includes('verification-complete'))
		expect(lien).toMatch(/\/auth\/verification-complete\?code=[0-9a-f]{40}$/)
		expect(mail.liens.some(l => l.includes('/admin'))).toBe(false)
	})
})
