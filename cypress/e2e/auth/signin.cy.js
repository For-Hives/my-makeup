describe('Login page', () => {
	before(() => {
		cy.log(`Visiting signin page`)
		cy.visit('/auth/signin')
	})

	it('Login with Google', () => {
		cy.get("[data-cy='google-signin']").should('exist')

		cy.intercept('GET', '/api/auth/providers').as('getProviders')
		cy.intercept('POST', '/api/auth/signin/google?').as('getGoogle')
		cy.get("[data-cy='google-signin']")
			.click()
			.then(() => {
				cy.wait('@getProviders').its('response.statusCode').should('eq', 304)
				cy.wait('@getGoogle').its('response.statusCode').should('eq', 200)
			})
	})

	it('Login with Facebook', () => {
		cy.get("[data-cy='facebook-signin']").should('exist')

		cy.intercept('GET', '/api/auth/providers').as('getProviders')
		cy.intercept('POST', '/api/auth/signin/facebook?').as('getFacebook')
		cy.get("[data-cy='facebook-signin']")
			.click()
			.then(() => {
				cy.wait('@getProviders').its('response.statusCode').should('eq', 304)
				cy.wait('@getFacebook').its('response.statusCode').should('eq', 200)
			})
	})

	it('Login with Email / Password', () => {
		cy.get("[data-cy='email-input']").click()
		cy.get("[data-cy='email-input']").type('breval2000@live.fr')
		cy.get("[data-cy='password-input']").type('@linuxAP5')
		cy.type('{enter}')

		// check if facebook login button exists and if it does, if it opens a popup
		cy.get(`a[href="${Cypress.env('SITE_NAME')}/api/auth/signin/facebook"]`)
			.should('exist')
			.and('have.attr', 'target', '_blank')
			.and('have.attr', 'rel', 'noopener noreferrer')

		const username = Cypress.env('FACEBOOK_USER')
		const password = Cypress.env('FACEBOOK_PW')
		const loginUrl = Cypress.env('SITE_NAME')
		const cookieName = Cypress.env('COOKIE_NAME')

		cy.log(`Logging in as ${username}`)

		const socialLoginOptions = {
			username,
			password,
			loginUrl,
			headless: true,
			logs: false,
			isPopup: true,
			loginSelector: `a[href="${Cypress.env(
				'SITE_NAME'
			)}/api/auth/signin/facebook"]`,
			postLoginSelector: '.unread-count',
		}

		return cy
			.task('FacebookSocialLogin', socialLoginOptions)
			.then(({ cookies }) => {
				cy.clearCookies()

				const cookie = cookies
					.filter(cookie => cookie.name === cookieName)
					.pop()
				if (cookie) {
					cy.setCookie(cookie.name, cookie.value, {
						domain: cookie.domain,
						expiry: cookie.expires,
						httpOnly: cookie.httpOnly,
						path: cookie.path,
						secure: cookie.secure,
					})

					Cypress.Cookies.defaults({
						preserve: cookieName,
					})

					// remove the two lines below if you need to stay logged in
					// for your remaining tests
					cy.visit('/api/auth/signout')
					cy.get('form').submit()
				}
			})
	})
})
