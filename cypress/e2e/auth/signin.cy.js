it('Login with Email / Password', () => {
	cy.intercept('POST', '/api/auth/callback/credentials').as('getCredentials')

	cy.visit('http://localhost:3000/auth/signin')
	cy.get("[data-cy='email-input']").click()
	cy.get("[data-cy='email-input']").type(Cypress.env('TEST_USER'))
	cy.get("[data-cy='password-input']").type(Cypress.env('TEST_PW'))
	cy.get("[data-cy='email-signin']").click()

	cy.wait('@getCredentials').its('response.statusCode').should('eq', 200)
})
