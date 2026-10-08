import {
	contactMessage,
	mailgunClientOptions,
	mailgunErrorSummary,
} from '@/lib/mailgun'

const formData = require('form-data')
const Mailgun = require('mailgun.js')
const mailgun = new Mailgun(formData)

// created on demand: the library throws on a missing key
function mailgunClient() {
	return mailgun.client(
		mailgunClientOptions({
			key: process.env.MAILGUN_API_KEY,
			region: process.env.MAILGUN_REGION,
		})
	)
}

// `[sendMail]` logs carry the outcome and the HTTP status only, never what
// the visitor typed (MES-11).
export default async function handler(req, res) {
	if (req.method !== 'POST') {
		return res.status(405).json({ message: 'Method not allowed' })
	}

	if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
		console.error('[sendMail] not configured')
		return res.status(503).json({ success: false })
	}

	const checked = contactMessage(req.body)
	if (!checked.ok) {
		console.warn('[sendMail] rejected', { field: checked.field })
		return res.status(400).json({ success: false })
	}

	const { fields } = checked
	try {
		await mailgunClient().messages.create(process.env.MAILGUN_DOMAIN, {
			from: 'My-Makeup <contact@my-makeup.fr>',
			to: 'contact@my-makeup.fr',
			subject: 'Nouveau message de contact',
			text: `
                Nom: ${fields.last_name} \n
                Prénom: ${fields.first_name} \n
                Email: ${fields.email} \n
                Numéro de téléphone: ${fields.phone_number} \n
                Message: ${fields.message}
            `,
		})
		console.info('[sendMail] sent')
		return res.status(200).json({ success: true })
	} catch (error) {
		console.error('[sendMail] failed', mailgunErrorSummary(error))
		return res.status(502).json({ success: false })
	}
}
