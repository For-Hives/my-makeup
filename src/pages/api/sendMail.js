const formData = require('form-data')
const Mailgun = require('mailgun.js')
const mailgun = new Mailgun(formData)
const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY })

export default function handler(req, res) {
	console.log(req.body)
	if (req.method === 'POST') {
		mg.messages
			.create(process.env.MAILGUN_DOMAIN, {
				from: 'Excited User <mailgun@sandbox-123.mailgun.org>',
				to: ['cinquin.andy@gmail.com'],
				subject: 'Test - Hello',
				text: 'Testing some Mailgun awesomeness!',
				html: '<h1>Testing some Mailgun awesomeness!</h1>',
			})
			.then(msg => console.log(msg)) // logs response data
			.catch(err => console.log(err)) // logs any error
	} else {
		res.status(405).json({ message: 'Method not allowed' })
	}
}
