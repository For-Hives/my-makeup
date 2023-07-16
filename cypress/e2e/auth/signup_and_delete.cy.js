it('Login with Email / Password', () => {
	cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials')

	cy.visit('http://localhost:3000/auth/signup')
	cy.get("[data-cy='email']")
		.clear()
		.type('2' + Cypress.env('TEST_USER'))
	cy.get("[data-cy='name']")
		.clear()
		.type('2' + Cypress.env('TEST_USER'))
	cy.get("[data-cy='password']")
		.clear()
		.type('2' + Cypress.env('TEST_PW'))
	cy.get("[data-cy='submit']").click()

	cy.wait('@getCredentials').its('response.statusCode').should('eq', 200)
})
