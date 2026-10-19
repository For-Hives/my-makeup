import { afterAll, describe, expect, test } from 'bun:test'
import { connecter } from '@/lib/auth/connexion'
import { messageErreur } from '@/lib/auth/erreurs'
import { creerFrein } from '@/lib/auth/frein'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { journalDe } from '@/lib/auth/journal'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The account an admin has blocked (ticket 089; plan 01 §6.1). The page of the sign-in with its
 * message is played by the unit tests of the form; the admin screen that blocks arrives with
 * ticket 168.
 */

afterAll(async () => {
	await viderLaBase()
})

const MOT_DE_PASSE = 'aaaaaaaa'
const frein = creerFrein({ nom: 'essai-int-bloque', limite: 1000, fenetreMs: 60_000 })
let n = 0
const adresse = () => new Headers({ 'x-forwarded-for': `192.0.2.${150 + (n++ % 100)}` })

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

async function sessionsEnBase(id: number | string): Promise<number> {
	const payload = await payloadDeTest()
	const ligne = await payload.db.findOne<{ id: number; sessions?: unknown[] }>({
		collection: 'pros',
		where: { id: { equals: id } },
	})
	return ligne?.sessions?.length ?? 0
}

async function qui(enTetes: Record<string, string>) {
	const payload = await payloadDeTest()
	return (await payload.auth({ headers: new Headers(enTetes) })).user
}

const journal = async () =>
	(
		await (
			await payloadDeTest()
		).find({ collection: 'auth-events', depth: 0, limit: 1000, pagination: false, sort: 'id' })
	).docs

/** What an admin does in the panel: the update goes through the access rules of her account. */
async function bloquerParUnAdmin(id: number | string, bloque: boolean) {
	const payload = await payloadDeTest()
	const admin = await creerCompte('admin')
	const user = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
	await payload.update({
		collection: 'pros',
		id,
		data: { blocked: bloque },
		depth: 0,
		overrideAccess: false,
		user: { ...user, collection: 'admins' },
	})
}

describe('un compte bloqué ne peut pas se connecter', () => {
	test('bon mot de passe : le code « compte-bloque », son message, aucune session ouverte', async () => {
		const compte = await creerCompte('maquilleuse-bloquee', { motDePasse: () => MOT_DE_PASSE })
		expect(await sessionsEnBase(compte.id)).toBe(0)

		const reponse = await seConnecter(compte.email, MOT_DE_PASSE)

		expect(reponse).toEqual({ ok: false, code: 'compte-bloque' })
		expect(messageErreur('compte-bloque')).toContain('bloqué')
		expect(await sessionsEnBase(compte.id)).toBe(0)
	})

	test('mauvais mot de passe : le message générique, comme pour une adresse inconnue', async () => {
		const compte = await creerCompte('maquilleuse-bloquee', { motDePasse: () => MOT_DE_PASSE })

		expect(await seConnecter(compte.email, 'mauvais-mot-de-passe')).toEqual({
			ok: false,
			code: 'identifiants-invalides',
		})
		expect(await seConnecter(`inconnue-${compte.email}`, MOT_DE_PASSE)).toEqual({
			ok: false,
			code: 'identifiants-invalides',
		})
	})

	test('la porte REST refuse aussi, en 403 et en français ; une ligne « compte-bloque » au journal', async () => {
		const compte = await creerCompte('maquilleuse-bloquee', { motDePasse: () => MOT_DE_PASSE })
		const avant = (await journal()).length

		const { statut, enTetes, texte } = await appelerRest('POST', '/api/pros/login', {
			corps: { email: compte.email, password: MOT_DE_PASSE },
			enTetes: { 'x-forwarded-for': '192.0.2.99' },
		})

		expect(statut).toBe(403)
		expect(enTetes.get('set-cookie') ?? '').not.toContain('payload-token=')
		expect(texte).toContain(messageErreur('compte-bloque'))
		expect((await journal()).slice(avant).map(({ type, code }) => [type, code])).toEqual([['sign-in', 'compte-bloque']])
	})

	test('le formulaire laisse la même ligne au journal', async () => {
		const compte = await creerCompte('maquilleuse-bloquee', { motDePasse: () => MOT_DE_PASSE })
		const avant = (await journal()).length

		await seConnecter(compte.email, MOT_DE_PASSE)

		expect((await journal()).slice(avant).map(({ type, code }) => [type, code])).toEqual([['sign-in', 'compte-bloque']])
	})
})

describe('bloquer ferme les sessions, débloquer rend l’accès', () => {
	test('les sessions du compte sont fermées, celles des autres comptes intactes, puis le déblocage rouvre la connexion', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const autre = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const { enTetes } = compte.session
		expect((await qui(enTetes))?.id).toBe(Number(compte.id))
		expect(await sessionsEnBase(compte.id)).toBeGreaterThan(0)
		const avant = (await journal()).length

		await bloquerParUnAdmin(compte.id, true)

		expect(await sessionsEnBase(compte.id)).toBe(0)
		expect(await qui(enTetes)).toBeNull()
		expect((await qui(autre.session.enTetes))?.id).toBe(Number(autre.id))
		expect(await seConnecter(compte.email, MOT_DE_PASSE)).toEqual({ ok: false, code: 'compte-bloque' })

		await bloquerParUnAdmin(compte.id, false)

		const rouverte = await seConnecter(compte.email, MOT_DE_PASSE)
		expect(rouverte.ok).toBe(true)
		expect((await journal()).slice(avant).map(({ type, code }) => [type, code])).toEqual([
			['block', 'ok'],
			['sign-in', 'compte-bloque'],
			['unblock', 'ok'],
			['sign-in', 'ok'],
		])
	}, 30_000)

	test('enregistrer un compte déjà bloqué ne laisse pas de ligne de plus', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await bloquerParUnAdmin(compte.id, true)
		const avant = (await journal()).length

		await bloquerParUnAdmin(compte.id, true)

		expect((await journal()).length).toBe(avant)
	})
})

describe('seul l’admin change le blocage', () => {
	test('la maquilleuse ne se débloque pas elle-même, et ne se bloque pas non plus par erreur de rôle', async () => {
		const payload = await payloadDeTest()
		const bloquee = await creerCompte('maquilleuse-bloquee', { motDePasse: () => MOT_DE_PASSE })
		const libre = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const comme = async (id: number | string) => ({
			...(await payload.findByID({ collection: 'pros', id, depth: 0, overrideAccess: true })),
			collection: 'pros' as const,
		})

		await payload
			.update({
				collection: 'pros',
				id: bloquee.id,
				data: { blocked: false },
				depth: 0,
				overrideAccess: false,
				user: await comme(bloquee.id),
			})
			.catch(() => undefined)
		await payload.update({
			collection: 'pros',
			id: libre.id,
			data: { blocked: true, name: 'Nom changé' },
			depth: 0,
			overrideAccess: false,
			user: await comme(libre.id),
		})

		const lu = async (id: number | string) =>
			payload.findByID({ collection: 'pros', id, depth: 0, overrideAccess: true })
		expect((await lu(bloquee.id)).blocked).toBe(true)
		const apres = await lu(libre.id)
		expect(apres.blocked).toBe(false)
		expect(apres.name).toBe('Nom changé')
		expect(await sessionsEnBase(libre.id)).toBeGreaterThan(0)
	})
})
