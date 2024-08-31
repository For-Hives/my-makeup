/** @type {import("tailwindcss").Config} */
module.exports = {
	theme: {
		extend: {
			colors: {
				'my-makeup': {
					900: '#16191c',
				},
			},
		},
	},
	plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
	content: ['./src/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
}
