import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { CONTEXTE_IMPORT } from '@/lib/contexte-import'
import { creerEnvoiEmail, EnvoiEmailEchoue, envoiEmailDePayload } from '@/lib/emails/envoi'
import { composerEmail } from '@/lib/emails/gabarit'
import { optionsDeTransport } from '@/lib/emails/relais'
import { serverEnv } from '@/lib/env'
import { attendreLeMail, compterLesMails, lienDuMail, mailsRecus, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest } from '../outils/payload-test'

/** The address the application of the bench is served from: where the link of a mail must lead. */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? ''

/** An address of its own for each mail: a test only ever reads what it sent. */
const adresseFictive = (nom: string): string => `${nom}-${crypto.randomUUID()}@example.test`

const contenu = {
	sujet: 'Confirme ton adresse',
	titre: 'Bienvenue sur My Makeup',
	paragraphes: ['Un clic et ton compte est prêt.'],
	action: { libelle: 'Confirmer mon adresse', chemin: '/auth/confirmer?code=jeton-factice-0123' },
}

/** A port of this machine nothing listens on: asked from the system, then given back. */
async function portFerme(): Promise<number> {
	const serveur = createServer()
	await new Promise<void>(resolve => serveur.listen(0, '127.0.0.1', resolve))
	const adresse = serveur.address()
	await new Promise(resolve => serveur.close(resolve))
	if (adresse === null || typeof adresse === 'string') throw new Error('aucun port libre')
	return adresse.port
}

beforeAll(viderLeCapteur)
afterAll(viderLeCapteur)

describe('un email transactionnel part de la v3 et se lit dans le capteur du banc (ticket 073)', () => {
	test('objet, expéditeur, lien absolu, texte et HTML se relisent tels qu’ils sont partis', async () => {
		const payload = await payloadDeTest()
		const env = serverEnv()
		const envoyer = envoiEmailDePayload(payload, env)
		const adresse = adresseFictive('envoi')

		await envoyer({ a: adresse, ...composerEmail(contenu, SITE) })

		const mail = await attendreLeMail({ pour: adresse })
		expect(mail.sujet).toBe('Confirme ton adresse')
		expect(mail.de).toEqual({ nom: env.mail?.fromName ?? '', adresse: env.mail?.fromAddress ?? '' })
		expect(mail.de.adresse).toEndWith('@example.test')
		expect(mail.destinataires).toEqual([{ nom: '', adresse }])

		const lien = lienDuMail(mail, '/auth/confirmer')
		expect(lien).toBe(`${SITE}/auth/confirmer?code=jeton-factice-0123`)
		expect(lien).toMatch(/^https?:\/\//)
		expect(mail.texte).toContain(`Confirmer mon adresse : ${lien}`)
		expect(mail.texte).toContain('Bienvenue sur My Makeup')
		expect(mail.texte).toContain('Tu peux l’ignorer.')
		expect(mail.html).toContain(`href="${lien}"`)
		expect(mail.html).toContain('<html lang="fr">')
	})

	test('avec le contexte d’import, rien ne part', async () => {
		const payload = await payloadDeTest()
		const envoyer = envoiEmailDePayload(payload, serverEnv())
		const adresse = adresseFictive('import')
		const avant = await compterLesMails()

		await envoyer({ a: adresse, ...composerEmail(contenu, SITE) }, { context: CONTEXTE_IMPORT })
		// A mail that was going to arrive has arrived by now; a second one proves the catcher is alive.
		const temoin = adresseFictive('temoin')
		await envoyer({ a: temoin, ...composerEmail(contenu, SITE) })
		await attendreLeMail({ pour: temoin })

		expect(await mailsRecus(adresse)).toEqual([])
		expect(await compterLesMails()).toBe(avant + 1)
	})

	test('un relais qui ne répond pas : une erreur lisible, ni adresse ni jeton dans le journal', async () => {
		const payload = await payloadDeTest()
		const mort = nodemailerAdapter({
			defaultFromAddress: 'ne-pas-repondre@example.test',
			defaultFromName: 'My Makeup',
			skipVerify: true,
			transportOptions: optionsDeTransport({
				host: '127.0.0.1',
				port: await portFerme(),
				fromAddress: 'ne-pas-repondre@example.test',
				fromName: 'My Makeup',
			}),
		})
		const adaptateur = (await mort)({ payload })
		const lignes: string[] = []
		const envoyer = creerEnvoiEmail({
			relais: message => adaptateur.sendEmail(message),
			journal: { info: ligne => lignes.push(ligne), erreur: ligne => lignes.push(ligne) },
		})
		const adresse = adresseFictive('echec')

		const erreur = await envoyer({ a: adresse, ...composerEmail(contenu, SITE) }).then(
			() => undefined,
			(e: unknown) => e
		)

		expect(erreur).toBeInstanceOf(EnvoiEmailEchoue)
		const tout = [(erreur as Error).message, ...lignes].join('\n')
		for (const secret of [adresse, 'jeton-factice', '127.0.0.1', 'Confirme']) expect(tout).not.toContain(secret)
		expect(lignes).toHaveLength(1)
	})
})

describe('un relais qui se tait en route', () => {
	test('la porte rend une erreur lisible dans un délai borné, avec une seule ligne de journal', async () => {
		// It answers the greeting and EHLO, then says nothing: the case nodemailer waits ten minutes on.
		const serveur = createServer(socket => {
			socket.write('220 relais.exemple.test ESMTP\r\n')
			socket.once('data', () => socket.write('250 relais.exemple.test\r\n'))
			socket.on('error', () => undefined)
		})
		await new Promise<void>(resolve => serveur.listen(0, '127.0.0.1', resolve))
		const port = (serveur.address() as { port: number }).port
		try {
			const payload = await payloadDeTest()
			const adapter = await nodemailerAdapter({
				defaultFromAddress: 'ne-pas-repondre@example.test',
				defaultFromName: 'My Makeup',
				skipVerify: true,
				transportOptions: {
					...optionsDeTransport({
						host: '127.0.0.1',
						port,
						fromAddress: 'ne-pas-repondre@example.test',
						fromName: 'My Makeup',
					}),
					// Short for the test, same mechanism as the real delay (asserted in the unit tests).
					socketTimeout: 1500,
				},
			})
			const adaptateur = adapter({ payload })
			const lignes: string[] = []
			const envoyer = creerEnvoiEmail({
				relais: message => adaptateur.sendEmail(message),
				journal: { info: ligne => lignes.push(ligne), erreur: ligne => lignes.push(ligne) },
			})
			const adresse = adresseFictive('muet')
			const debut = Date.now()
			const erreur = await envoyer({ a: adresse, ...composerEmail(contenu, SITE) }).then(
				() => undefined,
				(e: unknown) => e
			)
			expect(erreur).toBeInstanceOf(EnvoiEmailEchoue)
			expect(Date.now() - debut).toBeLessThan(8000)
			expect(lignes).toHaveLength(1)
			for (const secret of [adresse, '127.0.0.1', 'Confirme']) expect(lignes.join('\n')).not.toContain(secret)
		} finally {
			await new Promise(resolve => serveur.close(resolve))
		}
	}, 15_000)
})
