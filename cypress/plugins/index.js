module.exports = (on, config) => {
	on('before:browser:launch', (browser = {}, launchOptions) => {
		if (browser.name === 'chrome') {
			launchOptions.args.push('--lang=fr')
			return launchOptions
		}
	})
}
