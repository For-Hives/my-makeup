describe('profil', () => {
	before(() => {
		cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials')

		cy.visit('http://localhost:3000/auth/signin')
		cy.get("[data-cy='email-input']").click()
		cy.get("[data-cy='email-input']").type('breval2000@live.fr')
		cy.get("[data-cy='password-input']").type('@linuxAP5')
		cy.get("[data-cy='email-signin']").click()

		cy.wait('@getCredentials').its('response.statusCode').should('eq', 200)
	})

	describe('Resume - section', () => {
		it('tests complet Resume - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare the file to upload
			cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture')

			// prepare to intercept the request
			cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload')
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUser'
			)

			// 	open the modal
			cy.get("[data-cy='update-resume-button']")
				.click({ force: true })
				.then(() => {
					//  update profil picture
					cy.get("[data-cy='file-main-upload']").selectFile('@profilPicture', {
						force: true,
					})

					//  update name and last name
					cy.get("[data-cy='first-name-input']").type('Breval')
					cy.get("[data-cy='last-name-input']").type('LE FLOCH')

					//  update speciality
					cy.get("[data-cy='speciality-input']").type(
						'Maquilleur professionnel et coiffeur professionnel pour le cinéma et la télévision'
					)

					// switch availability to true
					// cy.get('[data-cy=\'available-input\']').click();   // todo : check the aivailability switch

					cy.get("[data-cy='save-resume-button']")
						.click()
						.then(() => {
							// wait for the upload to finish
							cy.wait('@upload').its('response.statusCode').should('eq', 200)
							cy.wait('@updateUser')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})

	describe('Location - section', () => {
		it('tests complet Location - section', () => {})
	})
})

describe('profil', () => {
	it('tests profil', () => {
		cy.get('div.md\\:col-span-4 > div:nth-of-type(1) button').click()
		cy.get("[data-cy='city-input']").click()
		cy.get('#headlessui-dialog-\\:r9\\: > div.z-30 > div').click()
		cy.get("[data-cy='city-input']").type('Nantes')
		cy.get("[data-cy='action-radius-input']").click()
		cy.get("[data-cy='action-radius-input']").type('5')
		cy.get("[data-cy='save-button']").click()
		cy.get('div.md\\:col-span-8 > div:nth-of-type(1) button > div').click()
		cy.get("[data-cy='description']").click()
		cy.get("[data-cy='description']").type(
			'Je suis une vraie maquilleuse je te jure si'
		)
		cy.get("[data-cy='save-description']").click()
		cy.get('div.md\\:col-span-4 > div:nth-of-type(2) button').click()
		cy.get("[data-cy='website-input']").click()
		cy.get("[data-cy='website-input']").type('brev.A')
		cy.get("[data-cy='website-input']").type('brev.al')
		cy.get('div.mt-4 > button').click()
		cy.get("[data-cy='email-input']").type('breval2000@live.fr')
		cy.get("[data-cy='phone-input']").type('0782510664')
		cy.get("[data-cy='youtube-input']").type('youtube.be')
		cy.get("[data-cy='facebook-input']").type('facebook.ok')
		cy.get("[data-cy='instagram-input']").type('insta.ta')
		cy.get("[data-cy='linkedin-input']").type('linkedin.in')
		cy.type('{enter}')
		cy.get('div.mt-4 > button').click()
		cy.get("[data-cy='youtube-input']").dblclick()
		cy.get("[data-cy='youtube-input']").type('youtube.com')
		cy.get("[data-cy='facebook-input']").type('facebook.com')
		cy.get("[data-cy='instagram-input']").type('insta.com')
		cy.get("[data-cy='linkedin-input']").type('linkedin.com')
		cy.get('div.mt-4 > button').click()
		cy.get('div.mt-4 > button').click()
		cy.get("[data-cy='youtube-input']").click()
		cy.get("[data-cy='youtube-input']").type('https://youtube.com')
		cy.get("[data-cy='facebook-input']").click()
		cy.get("[data-cy='facebook-input']").type('https://facebook.com')
		cy.get("[data-cy='instagram-input']").click()
		cy.get("[data-cy='instagram-input']").type('https://insta.com')
		cy.get("[data-cy='website-input']").click()
		cy.get("[data-cy='website-input']").type('https://brev.al')
		cy.get("[data-cy='linkedin-input']").click()
		cy.get("[data-cy='linkedin-input']").type('https://linkedin.com')
		cy.get('div.mt-4 > button').click()
		cy.get('div.md\\:col-span-8 > div:nth-of-type(2) > div > button').click()
		cy.get('#headlessui-portal-root p').click()
		cy.get("[data-cy='file-upload']").type(
			'C:\\fakepath\\1996b895f8f4e4a575ee7827db79b1a7.png'
		)
		cy.get("[data-cy='portfolio-submit']").click()
		cy.get("[data-cy='portfolio-save']").click()
		cy.get('div.md\\:col-span-8 > div:nth-of-type(2) > div > button').click()
		cy.get(
			'#headlessui-portal-root div.flex > div:nth-of-type(2) > button'
		).click()
		cy.get(
			'#headlessui-portal-root div.flex > div:nth-of-type(2) > button'
		).click()
		cy.get(
			'#headlessui-portal-root div.flex > div:nth-of-type(2) > button'
		).click()
		cy.get(
			'#headlessui-portal-root div.flex > div:nth-of-type(2) > button'
		).click()
		cy.get('#headlessui-dialog-panel-\\:r13\\: > button > span').click()
		cy.get('div.md\\:col-span-4 > div:nth-of-type(3) button').click()
		cy.get("[data-cy='skills-input']").click()
		cy.get("[data-cy='skills-input']").type('pieds')
		cy.type('{enter}')
		cy.get("[data-cy='save-skills']").click()
		cy.get('div.md\\:col-span-8 > div:nth-of-type(3) button > div').click()
		cy.get("[data-cy='name-service-offers-input']").click()
		cy.get("[data-cy='name-service-offers-input']").type('Sage')
		cy.get("[data-cy='description-service-offers-input']").click()
		cy.get("[data-cy='description-service-offers-input']").type('dateger')
		cy.get("[data-cy='price-service-offers-input']").click()
		cy.get("[data-cy='price-service-offers-input']").type('12')
		cy.get("[data-cy='add-service-offers-option-button']").click()
		cy.get("[data-cy='description-service-offers-option-input-0']").click()
		cy.get("[data-cy='name-service-offers-option-input-0']").click()
		cy.get("[data-cy='name-service-offers-option-input-0']").type('ongle')
		cy.get("[data-cy='description-service-offers-option-input-0']").type('test')
		cy.get("[data-cy='price-service-offers-option-input-0']").click()
		cy.get("[data-cy='price-service-offers-option-input-0']").type('5')
		cy.get("[data-cy='add-service-offers-button']").click()
		cy.get('#headlessui-portal-root svg').click()
		cy.get("[data-cy='save-service-offers-button']").click()
		cy.get('div:nth-of-type(5) span.font-semibold').click()
		cy.get('#diploma').click()
		cy.get('#diploma').type('E')
		cy.get('#diploma').type('Epsi')
		cy.get("[data-cy='school-input']").type('epsi')
		cy.get("[data-cy='date-graduation-input']").type('2022-12-15')
		cy.get('#course_description').click()
		cy.get('#course_description').type('informatique')
		cy.get("[data-cy='add-course-button']").click()
		cy.get('div.mt-4 > button').click()
		cy.get('div.md\\:col-span-8 > div:nth-of-type(4) button').click()
		cy.get("[data-cy='company-input']").click()
		cy.get("[data-cy='company-input']").type('RCA')
		cy.get("[data-cy='job_name-input']").type('dev')
		cy.get("[data-cy='city-input']").type('NA')
		cy.get("[data-cy='city-input']").type('NAntes')
		cy.get("[data-cy='date_start-input']").type('5060-05-20')
		cy.get("[data-cy='date_end-input']").click()
		cy.get("[data-cy='date_end-input']").type('51551-10-15')
		cy.get("[data-cy='description-experience-input']").click()
		cy.get("[data-cy='description-experience-input']").type(
			'fefeffeefefefff ff open'
		)
		cy.get('#headlessui-dialog-panel-\\:r2b\\:').click()
		cy.get("[data-cy='add-experience-button']").click()
		cy.get('div.mt-4 > button').click()
	})
})
