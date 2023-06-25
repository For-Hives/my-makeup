const { defineConfig } = require('cypress')

module.exports = defineConfig({
	e2e: {
		baseUrl: 'http://localhost:3000',
		defaultCommandTimeout: 10000,
		reporter: 'junit',
		reporterOptions: {
			reporterEnabled: 'mochawesome',
			mochaFile: 'cypress/reports/junit/test_results[hash].xml',
		},
	},
})
