let cookies = null

describe('profil', () => {
	before(() => {
		cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials')

		cy.visit('http://localhost:3000/auth/signin')
		cy.get("[data-cy='email-input']").click()
		cy.get("[data-cy='email-input']").type(Cypress.env('TEST_USER'))
		cy.get("[data-cy='password-input']").type(Cypress.env('TEST_PW'))
		cy.get("[data-cy='email-signin']").click()

		cy.wait('@getCredentials').its('response.statusCode').should('eq', 200)

		// Save cookies after login
		cy.getAllCookies().then(cookie => {
			cookies = cookie
		})
	})

	beforeEach(() => {
		cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
			'patchMeMakeup'
		)

		// If cookies exist, set them before each test
		if (cookies) {
			cookies.forEach(cookie => {
				cy.setCookie(cookie.name, cookie.value, {
					domain: cookie.domain,
					expiry: cookie.expiry,
					httpOnly: cookie.httpOnly,
					path: cookie.path,
					secure: cookie.secure,
					sameSite: cookie.sameSite,
				})
			})
		}
	})

	describe('check if the search, is ok', () => {
		it('tests complet Resume - section', () => {
			cy.request({
				method: 'POST',
				url: 'https://api.my-makeup.fr/api/auth/local',
				headers: {
					'Content-Type': 'application/json',
				},
				body: {
					identifier: 'test@forhive.fr',
					password: 'TESTtest@1',
				},
			}).then(response => {
				const jwtToken = response.body.jwt
				cy.request({
					method: 'PATCH',
					url: 'https://api.my-makeup.fr/api/me-makeup',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'TEST',
						first_name: 'test',
						speciality: '',
						city: null,
						action_radius: null,
						score: null,
						available: null,
						description: null,
						company_artist_name: null,
						skills: [],
						network: {
							youtube: null,
							facebook: null,
							instagram: null,
							website: null,
							linkedin: null,
							phone: null,
							email: null,
						},
						experiences: [],
						courses: [],
						service_offers: [],
						image_gallery: null,
						main_picture: null,
						language: [],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)
				})
			})
		})
	})
})
