import { QUOTE_RETENTION_MONTHS, type QuoteRequest, SERVICE_TYPE_LABELS } from '../quote/request'
import type { EmailContent } from './layout'

/**
 * The two mails of a quote request (issue 1003). They leave by the one door of the site
 * (src/lib/emails/send.ts).
 *
 * - To the artist: a fixed subject that holds nothing of the client, the whole request in the body (it is
 *   her request), the address of the client as the address of the reply, a button to her space. Tone: « tu ».
 * - To the client: an acknowledgement that says nothing she typed (the site never relays free text to an
 *   address someone typed), in « vous ».
 *
 * Pure: no `next` import, no Payload.
 */

export const QUOTE_ARTIST_SUBJECT = 'Nouvelle demande de devis sur My Makeup'
export const QUOTE_CLIENT_SUBJECT = 'Votre demande de devis a bien été envoyée'

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** `2027-06-12` as « 12 juin 2027 ». */
export const dayText = (day: string): string => DAY.format(new Date(`${day}T12:00:00.000Z`))

export function quoteArtistEmailContent(quote: QuoteRequest): EmailContent {
	return {
		sujet: QUOTE_ARTIST_SUBJECT,
		titre: 'Nouvelle demande de devis',
		paragraphes: [
			'Une cliente t’a envoyé une demande de devis depuis ton profil My Makeup.',
			`Prénom : ${quote.firstName}`,
			`Email : ${quote.email}`,
			...(quote.phone === '' ? [] : [`Numéro de téléphone : ${quote.phone}`]),
			`Date de l’événement : ${dayText(quote.eventDate)}`,
			`Lieu : ${quote.place}`,
			`Type de prestation : ${SERVICE_TYPE_LABELS[quote.serviceType]}`,
			'Message :',
			...quote.message.split(/\r\n|\r|\n/),
		],
		action: { libelle: 'Voir mes demandes', chemin: '/auth/profil' },
		pied: 'Demande envoyée depuis ton profil My Makeup. Répondre à cet email répond à la cliente. Tu retrouves aussi la demande dans ton espace.',
	}
}

export function quoteClientEmailContent(): EmailContent {
	return {
		sujet: QUOTE_CLIENT_SUBJECT,
		titre: 'Votre demande a bien été envoyée',
		paragraphes: [
			'Votre demande a été transmise à la maquilleuse. Elle vous répondra directement, par email ou par téléphone, à l’adresse que vous avez indiquée.',
			`Vous n’avez rien d’autre à faire. Votre demande est conservée ${QUOTE_RETENTION_MONTHS} mois, puis supprimée.`,
		],
		pied: 'Cet email a été envoyé automatiquement par My Makeup. Vous n’êtes pas à l’origine de cette demande ? Vous pouvez l’ignorer.',
	}
}
