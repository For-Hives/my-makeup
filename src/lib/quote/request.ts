import { monthsBefore } from '../calendar'
import { validAddress } from '../contact/message'

/**
 * The rules of the quote request form (issue 1003), pure: the form, the Server Action and the tests share them.
 * No `next` import, no Payload.
 *
 * - A client sends, from the profile of a makeup artist: the date of her event, the place, the kind of service,
 *   a short message, her first name, her email and, if she wants, her telephone number. She ticks a box to
 *   consent to the request being sent to the artist and kept 6 months.
 * - The server checks everything before it writes anything: a request that fails a rule creates no row and
 *   sends no mail, whoever called the action.
 * - The sentences are in « vous »: they are on a public page.
 */

export const QUOTE_FIELDS = [
	'eventDate',
	'place',
	'serviceType',
	'message',
	'firstName',
	'email',
	'phone',
	'consent',
] as const
export type QuoteField = (typeof QUOTE_FIELDS)[number]

export const QUOTE_LIMITS = { place: 120, message: 1000, firstName: 100, email: 254, phone: 30 } as const

/** The kinds of service, as the form offers them. The values are stored; the labels are shown. */
export const SERVICE_TYPES = ['wedding', 'event', 'shoot', 'lesson', 'other'] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
	wedding: 'Mariage',
	event: 'Événement (soirée, fête, cérémonie)',
	shoot: 'Shooting, tournage',
	lesson: 'Cours de maquillage',
	other: 'Autre',
}

/** A request cycle: she marks it answered; she may take it back. */
export const QUOTE_STATUSES = ['new', 'answered'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = { new: 'Nouvelle', answered: 'Répondue' }

/** A request is kept this many calendar months after its reception, then deleted (privacy policy). */
export const QUOTE_RETENTION_MONTHS = 6

/** The instant before which a request is deleted: `now` minus 6 calendar months, in UTC. */
export function quotePurgeThreshold(now: Date): Date {
	return monthsBefore(now, QUOTE_RETENTION_MONTHS)
}

/** The furthest event date accepted: three years from today. */
const YEARS_AHEAD = 3

/** What the client typed, trimmed and checked. */
export interface QuoteRequest {
	/** `AAAA-MM-JJ`. */
	eventDate: string
	place: string
	serviceType: ServiceType
	message: string
	firstName: string
	email: string
	/** Empty when she gave none. */
	phone: string
}

export type QuoteErrors = Partial<Record<QuoteField, string>>

/** Everything the form can send, as text: what the form puts back in its fields after an answer. */
export type QuoteValues = Record<Exclude<QuoteField, 'consent'>, string>

export const QUOTE_SENT = 'Votre demande a bien été envoyée. Vous allez recevoir un email de confirmation.'
export const QUOTE_NOT_SAVED =
	'Une erreur s’est produite : votre demande n’a pas été envoyée. Ce que vous avez écrit est conservé, réessayez dans un instant.'
export const QUOTE_THROTTLED =
	'Vous avez envoyé beaucoup de demandes en peu de temps. Ce que vous avez écrit est conservé : patientez un peu, puis réessayez.'
export const QUOTE_VERIFICATION_FAILED =
	'La vérification anti-robot n’a pas abouti. Ce que vous avez écrit est conservé : réessayez dans un instant.'
export const QUOTE_UNAVAILABLE = 'Cette maquilleuse ne reçoit pas de demandes de devis pour le moment.'
export const QUOTE_ERRORS_SUMMARY = 'La demande n’a pas été envoyée : corrigez les champs signalés.'
/** The trap field of the form: out of sight, never filled by a person. */
export const QUOTE_TRAP_FIELD = 'commentaire'

/** What the form hands over: a `FormData`, or anything that can give a field by its name. */
export type QuoteFormInput = { get: (name: string) => unknown }

/** A value of the form as text: anything else (a file, a missing field) is an empty text. A NUL is dropped: the database refuses it. */
function text(value: unknown): string {
	return typeof value === 'string' ? value.replaceAll('\u0000', '').trim() : ''
}

/** Reads the fields as typed, without checking them: what the form puts back in its fields. */
export function quoteFormValues(input: QuoteFormInput): QuoteValues {
	return {
		eventDate: text(input.get('eventDate')),
		place: text(input.get('place')),
		serviceType: text(input.get('serviceType')),
		message: text(input.get('message')),
		firstName: text(input.get('firstName')),
		email: text(input.get('email')),
		phone: text(input.get('phone')),
	}
}

/** True for a real calendar day written `AAAA-MM-JJ`. */
function realDay(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
	const date = new Date(`${value}T12:00:00.000Z`)
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function addYears(day: string, years: number): string {
	const [year, month, date] = day.split('-').map(Number) as [number, number, number]
	return new Date(Date.UTC(year + years, month - 1, date, 12)).toISOString().slice(0, 10)
}

const isServiceType = (value: string): value is ServiceType => (SERVICE_TYPES as readonly string[]).includes(value)

/**
 * Checks a request. `today` is the day of Paris, `AAAA-MM-JJ`. Gives it cleaned, or one sentence per field in
 * error.
 */
export function validateQuote(
	input: QuoteFormInput,
	today: string
): { ok: true; quote: QuoteRequest } | { ok: false; errors: QuoteErrors } {
	const values = quoteFormValues(input)
	const errors: QuoteErrors = {}

	if (values.eventDate === '') errors.eventDate = 'La date est requise'
	else if (!realDay(values.eventDate)) errors.eventDate = 'La date n’est pas valide'
	else if (values.eventDate < today) errors.eventDate = 'La date doit être aujourd’hui ou plus tard'
	else if (values.eventDate > addYears(today, YEARS_AHEAD)) errors.eventDate = 'La date ne peut pas dépasser trois ans'

	if (values.place === '') errors.place = 'Le lieu est requis'
	else if (values.place.length > QUOTE_LIMITS.place)
		errors.place = `Le lieu ne doit pas dépasser ${QUOTE_LIMITS.place} caractères`

	if (!isServiceType(values.serviceType)) errors.serviceType = 'Choisissez un type de prestation'

	if (values.message === '') errors.message = 'Le message est requis'
	else if (values.message.length > QUOTE_LIMITS.message)
		errors.message = `Le message ne doit pas dépasser ${QUOTE_LIMITS.message} caractères`

	if (values.firstName === '') errors.firstName = 'Le prénom est requis'
	else if (values.firstName.length > QUOTE_LIMITS.firstName)
		errors.firstName = `Le prénom ne doit pas dépasser ${QUOTE_LIMITS.firstName} caractères`

	if (values.email === '' || values.email.length > QUOTE_LIMITS.email || !validAddress(values.email))
		errors.email = 'L’e-mail est invalide'

	if (values.phone.length > QUOTE_LIMITS.phone)
		errors.phone = `Le numéro de téléphone ne doit pas dépasser ${QUOTE_LIMITS.phone} caractères`

	// A box ticked sends `on`; anything else is not a consent.
	if (text(input.get('consent')) !== 'on') errors.consent = 'Cochez la case pour envoyer votre demande'

	if (Object.keys(errors).length > 0 || !isServiceType(values.serviceType)) return { ok: false, errors }
	return { ok: true, quote: { ...values, serviceType: values.serviceType } }
}

/** What the Server Action answers, and the form keeps between two sends. */
export type QuoteState =
	| { sent: true }
	| { errors: QuoteErrors; values: QuoteValues }
	| { failure: true; values: QuoteValues }
	| { throttled: true; values: QuoteValues }
	| { verification: true; values: QuoteValues }
	| { unavailable: true }
	| null
