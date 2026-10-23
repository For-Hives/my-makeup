import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import Page from '@/app/(front)/(site)/politique-de-confidentialite/page'
import { GOOGLE_ISSUER, UMAMI_ORIGIN_DEFAULT } from '@/lib/env'
import { HOST } from '@/lib/legal'
import { PHOTO_ERASURE_DAYS, PROVIDERS } from '@/lib/providers'
import { TURNSTILE_ORIGIN } from '@/lib/security-headers'
import { PURGE_DELAY_DAYS } from '@/lib/tasks/unconfirmed-accounts'
import { pageText } from '../support/page-text'

/**
 * The privacy policy says what is true on the day of the switch (ticket 189): the providers come
 * from one list (src/lib/providers.ts), compared here to the services the code is configured
 * for; the old email provider and the quote tool are gone; the confirmation of the email and the
 * delay of the photos are the ones the code applies.
 */

const read = (fichier: string): string => readFileSync(path.join(process.cwd(), fichier), 'utf8')
const text = pageText(renderToStaticMarkup(<Page />))
const byId = (id: string) => PROVIDERS.find(prestataire => prestataire.id === id)

describe('la liste des sous-traitants', () => {
	test('la page montre chaque entrée de la liste, et rien d’autre', () => {
		const lines = text.split('\n')
		const startedAt = lines.findIndex(ligne => ligne === 'Hébergement et prestataires')
		const list = lines.slice(startedAt + 1, startedAt + 1 + PROVIDERS.length)

		expect(list).toEqual(PROVIDERS.map(({ nom, phrase }) => `${nom} : ${phrase}`))
		expect(renderToStaticMarkup(<Page />).match(/<li[\s>]/g)).toHaveLength(PROVIDERS.length)
	})

	test('une seule entrée par rôle, les six rôles du site', () => {
		expect(PROVIDERS.map(({ id }) => id).sort()).toEqual([
			'email',
			'google',
			'hebergement',
			'mesure',
			'photos',
			'verification',
		])
	})

	test('l’hébergeur est celui des mentions légales', () => {
		expect(byId('hebergement')?.configuration).toBe(HOST.nom)
		expect(byId('hebergement')?.nom.startsWith(HOST.nom)).toBe(true)
	})

	test('la mesure est l’instance Umami que le site relaie', () => {
		expect(new URL(UMAMI_ORIGIN_DEFAULT).hostname.endsWith(byId('mesure')?.configuration as string)).toBe(true)
	})

	test('la connexion Google est celle de l’émetteur configuré', () => {
		expect(new URL(GOOGLE_ISSUER).hostname).toBe(byId('google')?.configuration as string)
	})

	test('la vérification anti-robot est l’origine que la politique de contenu et le script nomment (ticket 1000)', () => {
		expect(new URL(TURNSTILE_ORIGIN).hostname).toBe(byId('verification')?.configuration as string)
		expect(read('src/components/contact/TurnstileWidget.tsx')).not.toContain('http://')
		expect(text).toContain('Cloudflare Turnstile')
	})

	test('le stockage des photos et le relais d’emails sont ceux de la configuration d’exemple', () => {
		const example = read('.env.exemple')
		expect(example).toContain('Cloudflare R2')
		expect(example).toContain(byId('email')?.configuration as string)
		expect(read('src/lib/env.ts')).toContain(byId('photos')?.configuration as string)
		expect(byId('photos')?.nom).toContain('Cloudflare')
		expect(byId('email')?.nom).toContain('Resend')
	})

	test('chaque service externe de l’application a son entrée', () => {
		const batches = JSON.parse(read('package.json')).dependencies as Record<string, string>
		expect(batches['@payloadcms/storage-s3']).toBeDefined()
		expect(batches['@payloadcms/email-nodemailer']).toBeDefined()
		// The only network services the server code talks to: the S3 storage, the SMTP relay, the Umami
		// instance and the Google issuer. A new SDK or storage plugin must be named in the policy first.
		const external = Object.keys(batches).filter(
			nom =>
				/^@payloadcms\/(storage|email)-/.test(nom) ||
				/^@(aws-sdk|sendgrid|mailgun|sentry)\b|^(mailgun|resend|postmark)/.test(nom)
		)
		expect(external.sort()).toEqual(['@aws-sdk/client-s3', '@payloadcms/email-nodemailer', '@payloadcms/storage-s3'])
	})
})

describe('ce que la politique ne dit plus', () => {
	test.each(['devis', 'Mailgun', 'Typeform', 'Tally', 'Brevo'])('aucune mention de %s', mot => {
		expect(text.toLowerCase()).not.toContain(mot.toLowerCase())
	})
})

describe('les engagements que le code tient', () => {
	test('l’email est confirmé à l’inscription, et un compte jamais confirmé part au bout du délai de la tâche', () => {
		expect(text).toContain("Confirmation de l'adresse email : à l'inscription, nous envoyons")
		expect(text).toContain(`au bout de ${PURGE_DELAY_DAYS} jours`)
		expect(PURGE_DELAY_DAYS).toBe(7)
	})

	test('une photo retirée est effacée du stockage au bout de 30 jours, comme la règle de la corbeille', () => {
		expect(text).toContain(`effacée définitivement de notre stockage au bout de ${PHOTO_ERASURE_DAYS} jours`)
		expect(text).toContain('Une copie de sauvegarde de nos photos est faite chaque jour')
		expect(text).toContain('elle ne supprime rien')
		expect(read('src/lib/trash.ts')).toContain('erases what is there 30 days later')
		expect(read('README.md')).toContain('efface la corbeille au bout de 30 jours')
	})

	test('le message de contact garde ses 12 mois', () => {
		expect(text).toContain('Durée : 12 mois après sa réception')
	})
})
