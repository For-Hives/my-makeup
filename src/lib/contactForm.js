/**
 * Schema of the contact form (/contact). Each field is trimmed, then must be
 * non-empty and within CONTACT_LIMITS: the rules /api/sendMail applies. A
 * message the server would refuse is stopped in the form with an error under
 * the field, instead of the generic "Une erreur s'est produite !" toast.
 */
import { z } from 'zod'
import { CONTACT_LIMITS } from './mailgun.js'

const field = (required, tooLong, max) =>
	z
		.string({ required_error: required })
		.trim()
		.min(1, { message: required })
		.max(max, { message: `${tooLong} ne doit pas dépasser ${max} caractères` })

export const contactFormSchema = z.object({
	first_name: field(
		'Le prénom est requis',
		'Le prénom',
		CONTACT_LIMITS.first_name
	),
	last_name: field('Le nom est requis', 'Le nom', CONTACT_LIMITS.last_name),
	email: z
		.string({ required_error: "L'e-mail est invalide" })
		.trim()
		.max(CONTACT_LIMITS.email, {
			message: `L'e-mail ne doit pas dépasser ${CONTACT_LIMITS.email} caractères`,
		})
		.email({ message: "L'e-mail est invalide" }),
	phone_number: field(
		'Le numéro de téléphone est requis',
		'Le numéro de téléphone',
		CONTACT_LIMITS.phone_number
	),
	message: field('Le message est requis', 'Le message', CONTACT_LIMITS.message),
})
