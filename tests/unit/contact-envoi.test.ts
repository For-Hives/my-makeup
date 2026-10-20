import { describe, expect, test } from 'bun:test'
import { enregistrerUnMessageDeContact, expedier, type StockageDesDemandes } from '@/lib/contact/payload-send'
import type { EtatDuMail, StatutDeDemande } from '@/lib/contact/states'
import { creerFreinsDeContact } from '@/lib/contact/rate-limit'
import type { MessageDeContact } from '@/lib/contact/message'
import { AUCUN_RELAIS, type EmailAEnvoyer, EnvoiEmailEchoue, type EnvoyerEmail } from '@/lib/emails/send'

/**
 * The contact message, server side, with doubles for the store and the mail door (tickets 158 and 159; plan 02
 * I32 and I33 adapted: the mails leave by SMTP, which no HTTP simulation reaches, so the door is the
 * dependency that fails or stays silent). The same lines against the real store, the real door and the mail
 * catcher are in tests/integration/contact.test.ts.
 */

// Unique markers: a log line that holds one of them quotes what the visitor typed.
const MARQUEURS = {
	prenom: 'PRENOMMARQUEUR',
	nom: 'NOMMARQUEUR',
	email: 'mq-adresse@example.test',
	telephone: '0199TELMARQUEUR',
	message: 'MESSAGEMARQUEUR',
}
const formulaire = (surcharge: Record<string, unknown> = {}) => {
	const valeurs: Record<string, unknown> = { ...MARQUEURS, ...surcharge }
	return { get: (nom: string) => valeurs[nom] }
}

function banc(options: { creer?: () => Promise<number>; envoyer?: EnvoyerEmail; delaiMs?: number } = {}) {
	const evenements: string[] = []
	const lignes: string[] = []
	const lignesDeLaBase = new Map<number, { message: MessageDeContact; etatMail: EtatDuMail; statut: StatutDeDemande }>()
	const mails: EmailAEnvoyer[] = []
	const travaux: Promise<void>[] = []
	const stockage: StockageDesDemandes = {
		creer: async message => {
			evenements.push('creer')
			const id = (await options.creer?.()) ?? lignesDeLaBase.size + 1
			lignesDeLaBase.set(id, { message, etatMail: 'pending', statut: 'new' })
			return id
		},
		marquer: async (id, etatMail, statut) => {
			evenements.push(`marquer:${etatMail}`)
			const ligne = lignesDeLaBase.get(id)
			if (ligne) lignesDeLaBase.set(id, { ...ligne, etatMail, statut: statut ?? ligne.statut })
		},
	}
	const envoyer: EnvoyerEmail =
		options.envoyer ??
		(async email => {
			evenements.push('envoyer')
			mails.push(email)
		})
	const freins = creerFreinsDeContact(crypto.randomUUID())
	const entrees = (surcharge: Record<string, unknown> = {}) => ({
		formulaire: formulaire(surcharge),
		stockage,
		envoyer,
		destinataire: 'equipe@example.test',
		client: '203.0.113.9',
		freins,
		apres: (travail: () => Promise<void>) => void travaux.push(travail()),
		journal: { info: (l: string) => void lignes.push(l), erreur: (l: string) => void lignes.push(l) },
		...(options.delaiMs !== undefined && { delaiMs: options.delaiMs }),
	})
	return { entrees, freins, evenements, lignes, lignesDeLaBase, mails, termine: () => Promise.all(travaux) }
}

describe('I32 adapté : la ligne est écrite avant l’envoi, puis marquée transmise', () => {
	test('l’ordre : la ligne, puis le mail, puis l’état', async () => {
		const b = banc()
		const resultat = await enregistrerUnMessageDeContact(b.entrees())
		await b.termine()

		expect(resultat).toEqual({ ok: true })
		expect(b.evenements).toEqual(['creer', 'envoyer', 'marquer:sent'])
		expect([...b.lignesDeLaBase.values()]).toEqual([{ message: MARQUEURS, etatMail: 'sent', statut: 'forwarded' }])
	})

	test('un seul mail, à l’équipe, avec l’adresse saisie en réponse, et le sujet sans rien de saisi', async () => {
		const b = banc()
		await enregistrerUnMessageDeContact(b.entrees())
		await b.termine()

		expect(b.mails).toHaveLength(1)
		expect(b.mails[0]).toMatchObject({
			a: 'equipe@example.test',
			repondreA: MARQUEURS.email,
			sujet: 'Nouveau message de contact',
		})
	})

	test('la réponse part avant le mail : le visiteur n’attend jamais le relais', async () => {
		const b = banc()
		const entrees = { ...b.entrees(), apres: () => {} }
		await enregistrerUnMessageDeContact(entrees)
		expect(b.evenements).toEqual(['creer'])
	})
})

describe('un message invalide ne crée aucune ligne et n’envoie rien', () => {
	test.each([
		['un champ vide', { nom: '' }],
		['une adresse invalide', { email: 'pas-une-adresse' }],
		['un message trop long', { message: 'x'.repeat(5001) }],
		[
			'aucun champ du tout',
			{ prenom: undefined, nom: undefined, email: undefined, telephone: undefined, message: undefined },
		],
	])('%s', async (_cas, surcharge) => {
		const b = banc()
		const resultat = await enregistrerUnMessageDeContact(b.entrees(surcharge))
		await b.termine()

		expect(resultat.ok).toBe(false)
		expect(resultat).toMatchObject({ code: 'donnees-invalides' })
		expect(b.evenements).toEqual([])
		expect(b.mails).toEqual([])
	})
})

describe('I33 adapté : un email en panne ne perd pas le message', () => {
	const enPanne: EnvoyerEmail = async () => {
		throw new EnvoiEmailEchoue()
	}

	test('la porte échoue : la ligne reste, marquée en échec, la visiteuse a sa confirmation', async () => {
		const b = banc({ envoyer: enPanne })
		const resultat = await enregistrerUnMessageDeContact(b.entrees())
		await b.termine()

		expect(resultat).toEqual({ ok: true })
		expect([...b.lignesDeLaBase.values()]).toEqual([{ message: MARQUEURS, etatMail: 'failed', statut: 'new' }])
		expect(b.mails).toEqual([])
	})

	test('un relais muet : la réponse n’attend pas, et passé le délai la ligne est en échec', async () => {
		const b = banc({ envoyer: () => new Promise(() => {}), delaiMs: 50 })
		const debut = Date.now()
		const resultat = await enregistrerUnMessageDeContact(b.entrees())
		const reponseEn = Date.now() - debut
		await b.termine()
		const tout = Date.now() - debut

		expect(resultat).toEqual({ ok: true })
		expect(reponseEn).toBeLessThan(40)
		expect(tout).toBeGreaterThanOrEqual(45)
		expect(tout).toBeLessThan(1000)
		expect([...b.lignesDeLaBase.values()][0]).toMatchObject({ etatMail: 'failed', statut: 'new' })
	})

	test('le délai par défaut est sous les 10 secondes qu’une visiteuse attend au plus', async () => {
		const { DELAI_DE_L_ENVOI_MS } = await import('@/lib/contact/payload-send')
		expect(DELAI_DE_L_ENVOI_MS).toBeLessThan(10_000)
	})

	test('un relais lent qui finit par envoyer : la ligne dit envoyé', async () => {
		let partir: () => void = () => {}
		const b = banc({
			envoyer: () =>
				new Promise<void>(fin => {
					partir = fin
				}),
			delaiMs: 20,
		})
		await enregistrerUnMessageDeContact(b.entrees())
		await b.termine()
		expect([...b.lignesDeLaBase.values()][0]).toMatchObject({ etatMail: 'failed' })

		partir()
		await new Promise(r => setTimeout(r, 20))
		expect([...b.lignesDeLaBase.values()][0]).toMatchObject({ etatMail: 'sent', statut: 'forwarded' })
	})

	test('l’état qui ne peut pas s’écrire ne fait pas échouer la réponse', async () => {
		const b = banc({ envoyer: enPanne })
		const entrees = b.entrees()
		entrees.stockage.marquer = async () => {
			throw new Error('base en panne')
		}
		expect(await enregistrerUnMessageDeContact(entrees)).toEqual({ ok: true })
		await b.termine()
	})
})

describe('ticket 224 : sans relais d’envoi, le message n’est pas dit transmis', () => {
	const sansRelais: EnvoyerEmail = async () => AUCUN_RELAIS

	test('la porte signale qu’il n’y a pas de relais : la ligne reste en échec, jamais transmise, et le journal le dit', async () => {
		const b = banc({ envoyer: sansRelais })
		const resultat = await enregistrerUnMessageDeContact(b.entrees())
		await b.termine()

		expect(resultat).toEqual({ ok: true })
		expect([...b.lignesDeLaBase.values()]).toEqual([{ message: MARQUEURS, etatMail: 'failed', statut: 'new' }])
		expect(b.lignes.join('\n')).toContain('aucun relais')
		for (const marqueur of Object.values(MARQUEURS)) expect(b.lignes.join('\n')).not.toContain(marqueur)
	})

	test('l’envoi de l’admin sans relais rend « echec » aussi, et rien n’est marqué envoyé', async () => {
		const b = banc({ envoyer: sansRelais })
		const etat = await expedier(1, MARQUEURS, { ...b.entrees(), stockage: b.entrees().stockage })

		expect(etat).toBe('echec')
		expect(b.evenements).not.toContain('marquer:sent')
	})
})

describe('une ligne qui ne s’enregistre pas : rien ne part, la visiteuse l’apprend', () => {
	test('le stockage échoue : aucun mail, un échec d’enregistrement', async () => {
		const b = banc({
			creer: async () => {
				throw Object.assign(new Error('insert into demandes (...) values (MESSAGEMARQUEUR)'), { code: '08006' })
			},
		})
		const resultat = await enregistrerUnMessageDeContact(b.entrees())
		await b.termine()

		expect(resultat).toEqual({ ok: false, code: 'enregistrement-impossible' })
		expect(b.mails).toEqual([])
		expect(b.evenements).toEqual(['creer'])
	})
})

describe('le journal ne garde rien de ce qui a été saisi', () => {
	const cas: [string, Parameters<typeof banc>[0]][] = [
		['un envoi réussi', {}],
		[
			'un email en panne dont l’erreur cite l’adresse',
			{
				envoyer: async () => {
					throw Object.assign(new Error(`Recipient ${MARQUEURS.email} refused MESSAGEMARQUEUR`), { code: 'EENVELOPE' })
				},
			},
		],
		[
			'un stockage dont l’erreur cite les valeurs',
			{
				creer: async () => {
					throw Object.assign(new Error(`insert ... values (${MARQUEURS.prenom}, ${MARQUEURS.message})`), {
						name: 'DrizzleQueryError',
					})
				},
			},
		],
		['un relais muet', { envoyer: () => new Promise(() => {}), delaiMs: 10 }],
	]
	test.each(cas)('%s', async (_nom, options) => {
		const b = banc(options)
		await enregistrerUnMessageDeContact(b.entrees())
		await b.termine()

		for (const ligne of b.lignes) for (const saisi of Object.values(MARQUEURS)) expect(ligne).not.toContain(saisi)
		// The marker words themselves, whatever their case.
		for (const ligne of b.lignes) expect(ligne).not.toMatch(/MARQUEUR|mq-adresse/i)
	})
})
