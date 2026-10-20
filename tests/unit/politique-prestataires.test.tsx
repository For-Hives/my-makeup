import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import Page from '@/app/(front)/(site)/politique-de-confidentialite/page'
import { GOOGLE_ISSUER, UMAMI_ORIGIN_DEFAULT } from '@/lib/env'
import { HEBERGEUR } from '@/lib/legal'
import { PHOTO_ERASURE_DAYS, PROVIDERS } from '@/lib/providers'
import { PURGE_DELAY_DAYS } from '@/lib/tasks/unconfirmed-accounts'
import { texteDePage } from '../outils/texte-de-page'

/**
 * The privacy policy says what is true on the day of the switch (ticket 189): the providers come
 * from one list (src/lib/providers.ts), compared here to the services the code is configured
 * for; the old email provider and the quote tool are gone; the confirmation of the email and the
 * delay of the photos are the ones the code applies.
 */

const lire = (fichier: string): string => readFileSync(path.join(process.cwd(), fichier), 'utf8')
const texte = texteDePage(renderToStaticMarkup(<Page />))
const parId = (id: string) => PROVIDERS.find(prestataire => prestataire.id === id)

describe('la liste des sous-traitants', () => {
	test('la page montre chaque entrée de la liste, et rien d’autre', () => {
		const lignes = texte.split('\n')
		const debut = lignes.findIndex(ligne => ligne === 'Hébergement et prestataires')
		const liste = lignes.slice(debut + 1, debut + 1 + PROVIDERS.length)

		expect(liste).toEqual(PROVIDERS.map(({ nom, phrase }) => `${nom} : ${phrase}`))
		expect(renderToStaticMarkup(<Page />).match(/<li[\s>]/g)).toHaveLength(PROVIDERS.length)
	})

	test('une seule entrée par rôle, les cinq rôles du site', () => {
		expect(PROVIDERS.map(({ id }) => id).sort()).toEqual(['email', 'google', 'hebergement', 'mesure', 'photos'])
	})

	test('l’hébergeur est celui des mentions légales', () => {
		expect(parId('hebergement')?.configuration).toBe(HEBERGEUR.nom)
		expect(parId('hebergement')?.nom.startsWith(HEBERGEUR.nom)).toBe(true)
	})

	test('la mesure est l’instance Umami que le site relaie', () => {
		expect(new URL(UMAMI_ORIGIN_DEFAULT).hostname.endsWith(parId('mesure')?.configuration as string)).toBe(true)
	})

	test('la connexion Google est celle de l’émetteur configuré', () => {
		expect(new URL(GOOGLE_ISSUER).hostname).toBe(parId('google')?.configuration as string)
	})

	test('le stockage des photos et le relais d’emails sont ceux de la configuration d’exemple', () => {
		const exemple = lire('.env.exemple')
		expect(exemple).toContain('Cloudflare R2')
		expect(exemple).toContain(parId('email')?.configuration as string)
		expect(lire('src/lib/env.ts')).toContain(parId('photos')?.configuration as string)
		expect(parId('photos')?.nom).toContain('Cloudflare')
		expect(parId('email')?.nom).toContain('Resend')
	})

	test('chaque service externe de l’application a son entrée', () => {
		const paquets = JSON.parse(lire('package.json')).dependencies as Record<string, string>
		expect(paquets['@payloadcms/storage-s3']).toBeDefined()
		expect(paquets['@payloadcms/email-nodemailer']).toBeDefined()
		// The only network services the server code talks to: the S3 storage, the SMTP relay, the Umami
		// instance and the Google issuer. A new SDK or storage plugin must be named in the policy first.
		const externes = Object.keys(paquets).filter(
			nom =>
				/^@payloadcms\/(storage|email)-/.test(nom) ||
				/^@(aws-sdk|sendgrid|mailgun|sentry)\b|^(mailgun|resend|postmark)/.test(nom)
		)
		expect(externes.sort()).toEqual(['@aws-sdk/client-s3', '@payloadcms/email-nodemailer', '@payloadcms/storage-s3'])
	})
})

describe('ce que la politique ne dit plus', () => {
	test.each(['devis', 'Mailgun', 'Typeform', 'Tally', 'Brevo'])('aucune mention de %s', mot => {
		expect(texte.toLowerCase()).not.toContain(mot.toLowerCase())
	})
})

describe('les engagements que le code tient', () => {
	test('l’email est confirmé à l’inscription, et un compte jamais confirmé part au bout du délai de la tâche', () => {
		expect(texte).toContain("Confirmation de l'adresse email : à l'inscription, nous envoyons")
		expect(texte).toContain(`au bout de ${PURGE_DELAY_DAYS} jours`)
		expect(PURGE_DELAY_DAYS).toBe(7)
	})

	test('une photo retirée est effacée du stockage au bout de 30 jours, comme la règle de la corbeille', () => {
		expect(texte).toContain(`effacée définitivement de notre stockage au bout de ${PHOTO_ERASURE_DAYS} jours`)
		expect(lire('src/lib/trash.ts')).toContain('erases what is there 30 days later')
		expect(lire('README.md')).toContain('efface la corbeille au bout de 30 jours')
	})

	test('le message de contact garde ses 12 mois', () => {
		expect(texte).toContain('Durée : 12 mois après sa réception')
	})
})
