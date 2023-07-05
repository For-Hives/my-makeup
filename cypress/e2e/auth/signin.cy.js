before(() => {
	cy.log(`Visiting signin page`)
	cy.visit('/auth/signin')
})

describe('Login page', () => {
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
		cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials')

		cy.visit('http://localhost:3000/auth/signin')
		cy.get("[data-cy='email-input']").click()
		cy.get("[data-cy='email-input']").type('breval2000@live.fr')
		cy.get("[data-cy='password-input']").type('@linuxAP5')
		cy.get("[data-cy='email-signin']").click()

		cy.wait('@getCredentials').its('response.statusCode').should('eq', 200)
	})
})
