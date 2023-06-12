import mailgun from 'mailgun-js'

const mg = mailgun({
	apiKey: process.env.MAILGUN_API_KEY,
	domain: process.env.MAILGUN_DOMAIN,
})

export default function handler(req, res) {
	if (req.method === 'POST') {
		const data = {
			from: 'My Makeup <contact@my-makeup.fr>',
			to: 'cinquin.andy@gmail.com',
			subject: 'Nouveau message de contact',
			text: `
                Nom: ${req.body.lastName} \n
                Prénom: ${req.body.firstName} \n
                Entreprise: ${req.body.company} \n
                Email: ${req.body.email} \n
                Numéro de téléphone: ${req.body.phoneNumber} \n
                Message: ${req.body.message}
            `,
		}

		mg.messages().send(data, function (error, body) {
			if (error) {
				res.status(500).json({ success: false })
			} else {
				res.status(200).json({ success: true })
			}
		})
	} else {
		res.status(405).json({ message: 'Method not allowed' })
	}
}
