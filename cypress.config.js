const { defineConfig } = require('cypress')

module.exports = defineConfig({
	e2e: {
		baseUrl: 'http://localhost:3000',
		defaultCommandTimeout: 30000,
		numTestsKeptInMemory: 50, // Par défaut 50, mais si un jour les tests crash pour "out of memory" ne pas hésiter à baisser cette valeur.
		video: true,
		chromeWebSecurity: false,
		reporter: 'junit',
		reporterOptions: {
			reporterEnabled: 'mochawesome',
			mochaFile: 'cypress/reports/junit/test_results[hash].xml',
		},
	},

	component: {
		devServer: {
			framework: 'next',
			bundler: 'webpack',
		},
	},
})
