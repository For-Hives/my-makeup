const formData = require('form-data')
const Mailgun = require('mailgun.js')
const mailgun = new Mailgun(formData)
const mg = mailgun.client({
	username: 'api',
	key: process.env.MAILGUN_API_KEY,
})

export default function handler(req, res) {
	if (req.method === 'POST') {
		mg.messages
			.create(process.env.MAILGUN_DOMAIN, {
				from: 'My Makeup <contact@my-makeup.fr>',
				to: 'cinquin.andy@gmail.com',
				subject: 'Nouveau message de contact',
				text: `
                Nom: ${req.body.last_name} \n
                Prénom: ${req.body.first_name} \n
                Email: ${req.body.email} \n
                Numéro de téléphone: ${req.body.phone_number} \n
                Message: ${req.body.message}
            `,
			})
			.then(msg => {
				console.log(msg) // logs response data
				res.status(200).json({ success: true })
			})
			.catch(err => {
				console.log(err) // logs any error
				res.status(500).json({ success: false })
			})
	} else {
		res.status(405).json({ message: 'Method not allowed' })
	}
}
