const { defineConfig } = require('cypress')

module.exports = defineConfig({
	e2e: {
		projectId: 'xvg25a',
		baseUrl: 'http://localhost:3000',
		retries: {
			runMode: 3,
			openMode: 0,
		},
		defaultCommandTimeout: 30000,
		numTestsKeptInMemory: 50, // Par défaut 50, mais si un jour les tests crash pour "out of memory" ne pas hésiter à baisser cette valeur.
		video: true,
		blockHosts: '*.google-analytics.com',
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
