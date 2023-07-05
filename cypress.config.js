const { defineConfig } = require('cypress')
const { GoogleSocialLogin } = require('cypress-social-logins/src/Plugins')

module.exports = defineConfig({
	e2e: {
		baseUrl: 'http://localhost:3000',
		defaultCommandTimeout: 30000,
		numTestsKeptInMemory: 50, // Par défaut 50, mais si un jour les tests crash pour "out of memory" ne pas hésiter à baisser cette valeur.
		video: false,
		chromeWebSecurity: false,
		reporter: 'junit',
		reporterOptions: {
			reporterEnabled: 'mochawesome',
			mochaFile: 'cypress/reports/junit/test_results[hash].xml',
		},
		setupNodeEvents(on, config) {
			on('task', {
				GoogleSocialLogin: GoogleSocialLogin,
			})
		},
	},
})