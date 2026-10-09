import { sendMailHandler } from '@/lib/contactMail'
import { mailgunClientOptions } from '@/lib/mailgun'

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

// Resend (RESEND_API_KEY) or else Mailgun: see src/lib/contactMail.js
export default sendMailHandler({
	env: process.env,
	sendWithMailgun: (domain, message) => mailgunClient().messages.create(domain, message),
})
