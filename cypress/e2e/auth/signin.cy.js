it('Login with Email / Password', () => {
	cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials')

	cy.visit('http://localhost:3000/auth/signin')
	cy.get("[data-cy='email-input']").click()
	cy.get("[data-cy='email-input']").type('test@forhive.fr')
	cy.get("[data-cy='password-input']").type('TESTtest@1')
	cy.get("[data-cy='email-signin']").click()

	cy.wait('@getCredentials').its('response.statusCode').should('eq', 200)
})
