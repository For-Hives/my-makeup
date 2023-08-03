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
		cy.intercept(
			'PATCH',
			`${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`
		).as('patchMeMakeup')

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
		it('tests complet global, and complete', () => {
			cy.request({
				method: 'POST',
				url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/auth/local`,
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
					url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'DE TEST',
						first_name: 'Utilisateur',
						speciality:
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma',
						city: 'Nantes',
						action_radius: '5',
						available: true,
						description:
							"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience...",
						company_artist_name: 'My Makeup Artist',
						main_picture: {
							id: 1188,
							name: 'profil.png',
							alternativeText: null,
							caption: null,
							width: 128,
							height: 128,
							formats: null,
							hash: 'profil_692f22e433',
							ext: '.png',
							mime: 'image/png',
							size: 2.33,
							url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/profil_692f22e433.png',
							previewUrl: null,
							provider: 'minio-for-strapi-v4',
							provider_metadata: null,
							createdAt: '2023-07-14T17:09:07.683Z',
							updatedAt: '2023-07-14T17:09:07.683Z',
						},
						skills: [
							{
								name: 'pieds',
							},
						],
						experiences: [
							{
								company: 'ForHives',
								job_name: 'dev',
								city: 'Nantes',
								date_start: '2021-05-01',
								date_end: '2023-05-01',
								description: 'Développement web',
							},
						],
						courses: [
							{
								diploma: 'Epsi',
								school: 'epsi',
								date_graduation: '2022-12-15',
								course_description: 'informatique',
							},
						],
						service_offers: [
							{
								name: 'Maquillage',
								price: '50€',
								description: 'Maquillage de soirée',
								options: [
									{
										name: 'Maquillage 1',
										price: '50€ 1',
										description: 'Maquillage de soirée 1',
									},
									{
										name: 'Maquillage 2',
										price: '50€ 2',
										description: 'Maquillage de soirée 2',
									},
									{
										name: 'Maquillage 3',
										price: '50€ 3',
										description: 'Maquillage de soirée 3',
									},
								],
							},
						],
						network: {
							youtube: 'https://youtube.com',
							facebook: 'https://facebook.com',
							instagram: 'https://instagram.com',
							website: 'https://my-makeup.fr',
							linkedin: 'https://linkedin.com',
							email: 'test@forhives.fr',
							phone: '0606060606',
						},
						language: [
							{
								name: 'Anglais',
							},
						],
						image_gallery: [
							{
								id: 1189,
								name: '',
								alternativeText: null,
								caption: null,
								width: 128,
								height: 128,
								formats: null,
								hash: '_6d50597932',
								ext: '.bin',
								mime: 'application/octet-stream',
								size: 2.33,
								url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/_6d50597932.bin',
								previewUrl: null,
								provider: 'minio-for-strapi-v4',
								provider_metadata: null,
								createdAt: '2023-07-14T17:09:40.827Z',
								updatedAt: '2023-07-14T17:09:40.827Z',
							},
						],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.visit('http://localhost:3000/search').then(() => {
						cy.wait(1000)
						cy.get("[data-cy='search-input']").click()
						cy.get("[data-cy='search-input']").type('Utilisateur DE TEST')
						cy.get("[data-cy='search-button']").click()
						// at least one result
						cy.get("[data-cy='search-result']").first().should('exist')
					})
				})
			})
		})

		// todo unskip when the api functionnality is ready (for filter users)
		it.skip('tests no network  - section', () => {
			cy.request({
				method: 'POST',
				url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/auth/local`,
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
					url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'DE TEST',
						first_name: 'Utilisateur',
						speciality:
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma',
						city: 'Nantes',
						action_radius: '5',
						available: true,
						description:
							"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience...",
						company_artist_name: 'My Makeup Artist',
						main_picture: {
							id: 1188,
							name: 'profil.png',
							alternativeText: null,
							caption: null,
							width: 128,
							height: 128,
							formats: null,
							hash: 'profil_692f22e433',
							ext: '.png',
							mime: 'image/png',
							size: 2.33,
							url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/profil_692f22e433.png',
							previewUrl: null,
							provider: 'minio-for-strapi-v4',
							provider_metadata: null,
							createdAt: '2023-07-14T17:09:07.683Z',
							updatedAt: '2023-07-14T17:09:07.683Z',
						},
						skills: [
							{
								name: 'pieds',
							},
						],
						experiences: [
							{
								company: 'ForHives',
								job_name: 'dev',
								city: 'Nantes',
								date_start: '2021-05-01',
								date_end: '2023-05-01',
								description: 'Développement web',
							},
						],
						courses: [
							{
								diploma: 'Epsi',
								school: 'epsi',
								date_graduation: '2022-12-15',
								course_description: 'informatique',
							},
						],
						service_offers: [
							{
								name: 'Maquillage',
								price: '50€',
								description: 'Maquillage de soirée',
								options: [
									{
										name: 'Maquillage 1',
										price: '50€ 1',
										description: 'Maquillage de soirée 1',
									},
									{
										name: 'Maquillage 2',
										price: '50€ 2',
										description: 'Maquillage de soirée 2',
									},
									{
										name: 'Maquillage 3',
										price: '50€ 3',
										description: 'Maquillage de soirée 3',
									},
								],
							},
						],
						network: {},
						language: [
							{
								name: 'Anglais',
							},
						],
						image_gallery: [
							{
								id: 1189,
								name: '',
								alternativeText: null,
								caption: null,
								width: 128,
								height: 128,
								formats: null,
								hash: '_6d50597932',
								ext: '.bin',
								mime: 'application/octet-stream',
								size: 2.33,
								url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/_6d50597932.bin',
								previewUrl: null,
								provider: 'minio-for-strapi-v4',
								provider_metadata: null,
								createdAt: '2023-07-14T17:09:40.827Z',
								updatedAt: '2023-07-14T17:09:40.827Z',
							},
						],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.visit('http://localhost:3000/search').then(() => {
						cy.wait(1000)
						cy.get("[data-cy='search-input']").click()
						cy.get("[data-cy='search-input']").type('Utilisateur DE TEST')
						cy.get("[data-cy='search-button']").click()
						// at least one result
						cy.get("[data-cy='search-result']").first().should('not.exist')
					})
				})
			})
		})

		// todo unskip when the api functionnality is ready (for filter users)
		it.skip('tests no first name  - section', () => {
			cy.request({
				method: 'POST',
				url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/auth/local`,
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
					url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'DE TEST',
						first_name: null,
						speciality:
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma',
						city: 'Nantes',
						action_radius: '5',
						available: true,
						description:
							"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience...",
						company_artist_name: 'My Makeup Artist',
						main_picture: {
							id: 1188,
							name: 'profil.png',
							alternativeText: null,
							caption: null,
							width: 128,
							height: 128,
							formats: null,
							hash: 'profil_692f22e433',
							ext: '.png',
							mime: 'image/png',
							size: 2.33,
							url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/profil_692f22e433.png',
							previewUrl: null,
							provider: 'minio-for-strapi-v4',
							provider_metadata: null,
							createdAt: '2023-07-14T17:09:07.683Z',
							updatedAt: '2023-07-14T17:09:07.683Z',
						},
						skills: [
							{
								name: 'pieds',
							},
						],
						experiences: [
							{
								company: 'ForHives',
								job_name: 'dev',
								city: 'Nantes',
								date_start: '2021-05-01',
								date_end: '2023-05-01',
								description: 'Développement web',
							},
						],
						courses: [
							{
								diploma: 'Epsi',
								school: 'epsi',
								date_graduation: '2022-12-15',
								course_description: 'informatique',
							},
						],
						service_offers: [
							{
								name: 'Maquillage',
								price: '50€',
								description: 'Maquillage de soirée',
								options: [
									{
										name: 'Maquillage 1',
										price: '50€ 1',
										description: 'Maquillage de soirée 1',
									},
									{
										name: 'Maquillage 2',
										price: '50€ 2',
										description: 'Maquillage de soirée 2',
									},
									{
										name: 'Maquillage 3',
										price: '50€ 3',
										description: 'Maquillage de soirée 3',
									},
								],
							},
						],
						network: {},
						language: [
							{
								name: 'Anglais',
							},
						],
						image_gallery: [
							{
								id: 1189,
								name: '',
								alternativeText: null,
								caption: null,
								width: 128,
								height: 128,
								formats: null,
								hash: '_6d50597932',
								ext: '.bin',
								mime: 'application/octet-stream',
								size: 2.33,
								url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/_6d50597932.bin',
								previewUrl: null,
								provider: 'minio-for-strapi-v4',
								provider_metadata: null,
								createdAt: '2023-07-14T17:09:40.827Z',
								updatedAt: '2023-07-14T17:09:40.827Z',
							},
						],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.visit('http://localhost:3000/search').then(() => {
						cy.wait(1000)
						cy.get("[data-cy='search-input']").click()
						cy.get("[data-cy='search-input']").type('Utilisateur DE TEST')
						cy.get("[data-cy='search-button']").click()
						// at least one result
						cy.get("[data-cy='search-result']").first().should('not.exist')
					})
				})
			})
		})

		// todo unskip when the api functionnality is ready (for filter users)
		it.skip('tests no last name  - section', () => {
			cy.request({
				method: 'POST',
				url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/auth/local`,
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
					url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: null,
						first_name: 'Utilisateur',
						speciality:
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma',
						city: 'Nantes',
						action_radius: '5',
						available: true,
						description:
							"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience...",
						company_artist_name: 'My Makeup Artist',
						main_picture: {
							id: 1188,
							name: 'profil.png',
							alternativeText: null,
							caption: null,
							width: 128,
							height: 128,
							formats: null,
							hash: 'profil_692f22e433',
							ext: '.png',
							mime: 'image/png',
							size: 2.33,
							url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/profil_692f22e433.png',
							previewUrl: null,
							provider: 'minio-for-strapi-v4',
							provider_metadata: null,
							createdAt: '2023-07-14T17:09:07.683Z',
							updatedAt: '2023-07-14T17:09:07.683Z',
						},
						skills: [
							{
								name: 'pieds',
							},
						],
						experiences: [
							{
								company: 'ForHives',
								job_name: 'dev',
								city: 'Nantes',
								date_start: '2021-05-01',
								date_end: '2023-05-01',
								description: 'Développement web',
							},
						],
						courses: [
							{
								diploma: 'Epsi',
								school: 'epsi',
								date_graduation: '2022-12-15',
								course_description: 'informatique',
							},
						],
						service_offers: [
							{
								name: 'Maquillage',
								price: '50€',
								description: 'Maquillage de soirée',
								options: [
									{
										name: 'Maquillage 1',
										price: '50€ 1',
										description: 'Maquillage de soirée 1',
									},
									{
										name: 'Maquillage 2',
										price: '50€ 2',
										description: 'Maquillage de soirée 2',
									},
									{
										name: 'Maquillage 3',
										price: '50€ 3',
										description: 'Maquillage de soirée 3',
									},
								],
							},
						],
						network: {},
						language: [
							{
								name: 'Anglais',
							},
						],
						image_gallery: [
							{
								id: 1189,
								name: '',
								alternativeText: null,
								caption: null,
								width: 128,
								height: 128,
								formats: null,
								hash: '_6d50597932',
								ext: '.bin',
								mime: 'application/octet-stream',
								size: 2.33,
								url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/_6d50597932.bin',
								previewUrl: null,
								provider: 'minio-for-strapi-v4',
								provider_metadata: null,
								createdAt: '2023-07-14T17:09:40.827Z',
								updatedAt: '2023-07-14T17:09:40.827Z',
							},
						],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.visit('http://localhost:3000/search').then(() => {
						cy.wait(1000)
						cy.get("[data-cy='search-input']").click()
						cy.get("[data-cy='search-input']").type('Utilisateur DE TEST')
						cy.get("[data-cy='search-button']").click()
						// at least one result
						cy.get("[data-cy='search-result']").first().should('not.exist')
					})
				})
			})
		})

		// todo unskip when the api functionnality is ready (for filter users)
		it.skip('tests no speciality  - section', () => {
			cy.request({
				method: 'POST',
				url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/auth/local`,
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
					url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'DE TEST',
						first_name: 'Utilisateur',
						speciality: null,
						city: 'Nantes',
						action_radius: '5',
						available: true,
						description:
							"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience...",
						company_artist_name: 'My Makeup Artist',
						main_picture: {
							id: 1188,
							name: 'profil.png',
							alternativeText: null,
							caption: null,
							width: 128,
							height: 128,
							formats: null,
							hash: 'profil_692f22e433',
							ext: '.png',
							mime: 'image/png',
							size: 2.33,
							url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/profil_692f22e433.png',
							previewUrl: null,
							provider: 'minio-for-strapi-v4',
							provider_metadata: null,
							createdAt: '2023-07-14T17:09:07.683Z',
							updatedAt: '2023-07-14T17:09:07.683Z',
						},
						skills: [
							{
								name: 'pieds',
							},
						],
						experiences: [
							{
								company: 'ForHives',
								job_name: 'dev',
								city: 'Nantes',
								date_start: '2021-05-01',
								date_end: '2023-05-01',
								description: 'Développement web',
							},
						],
						courses: [
							{
								diploma: 'Epsi',
								school: 'epsi',
								date_graduation: '2022-12-15',
								course_description: 'informatique',
							},
						],
						service_offers: [
							{
								name: 'Maquillage',
								price: '50€',
								description: 'Maquillage de soirée',
								options: [
									{
										name: 'Maquillage 1',
										price: '50€ 1',
										description: 'Maquillage de soirée 1',
									},
									{
										name: 'Maquillage 2',
										price: '50€ 2',
										description: 'Maquillage de soirée 2',
									},
									{
										name: 'Maquillage 3',
										price: '50€ 3',
										description: 'Maquillage de soirée 3',
									},
								],
							},
						],
						network: {},
						language: [
							{
								name: 'Anglais',
							},
						],
						image_gallery: [
							{
								id: 1189,
								name: '',
								alternativeText: null,
								caption: null,
								width: 128,
								height: 128,
								formats: null,
								hash: '_6d50597932',
								ext: '.bin',
								mime: 'application/octet-stream',
								size: 2.33,
								url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/_6d50597932.bin',
								previewUrl: null,
								provider: 'minio-for-strapi-v4',
								provider_metadata: null,
								createdAt: '2023-07-14T17:09:40.827Z',
								updatedAt: '2023-07-14T17:09:40.827Z',
							},
						],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.visit('http://localhost:3000/search').then(() => {
						cy.wait(1000)
						cy.get("[data-cy='search-input']").click()
						cy.get("[data-cy='search-input']").type('Utilisateur DE TEST')
						cy.get("[data-cy='search-button']").click()
						// at least one result
						cy.get("[data-cy='search-result']").first().should('not.exist')
					})
				})
			})
		})

		// todo unskip when the api functionnality is ready (for filter users)
		it.skip('tests no city  - section', () => {
			cy.request({
				method: 'POST',
				url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/auth/local`,
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
					url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'DE TEST',
						first_name: 'Utilisateur',
						speciality:
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma',
						city: null,
						action_radius: '5',
						available: true,
						description:
							"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience...",
						company_artist_name: 'My Makeup Artist',
						main_picture: {
							id: 1188,
							name: 'profil.png',
							alternativeText: null,
							caption: null,
							width: 128,
							height: 128,
							formats: null,
							hash: 'profil_692f22e433',
							ext: '.png',
							mime: 'image/png',
							size: 2.33,
							url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/profil_692f22e433.png',
							previewUrl: null,
							provider: 'minio-for-strapi-v4',
							provider_metadata: null,
							createdAt: '2023-07-14T17:09:07.683Z',
							updatedAt: '2023-07-14T17:09:07.683Z',
						},
						skills: [
							{
								name: 'pieds',
							},
						],
						experiences: [
							{
								company: 'ForHives',
								job_name: 'dev',
								city: 'Nantes',
								date_start: '2021-05-01',
								date_end: '2023-05-01',
								description: 'Développement web',
							},
						],
						courses: [
							{
								diploma: 'Epsi',
								school: 'epsi',
								date_graduation: '2022-12-15',
								course_description: 'informatique',
							},
						],
						service_offers: [
							{
								name: 'Maquillage',
								price: '50€',
								description: 'Maquillage de soirée',
								options: [
									{
										name: 'Maquillage 1',
										price: '50€ 1',
										description: 'Maquillage de soirée 1',
									},
									{
										name: 'Maquillage 2',
										price: '50€ 2',
										description: 'Maquillage de soirée 2',
									},
									{
										name: 'Maquillage 3',
										price: '50€ 3',
										description: 'Maquillage de soirée 3',
									},
								],
							},
						],
						network: {},
						language: [
							{
								name: 'Anglais',
							},
						],
						image_gallery: [
							{
								id: 1189,
								name: '',
								alternativeText: null,
								caption: null,
								width: 128,
								height: 128,
								formats: null,
								hash: '_6d50597932',
								ext: '.bin',
								mime: 'application/octet-stream',
								size: 2.33,
								url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/_6d50597932.bin',
								previewUrl: null,
								provider: 'minio-for-strapi-v4',
								provider_metadata: null,
								createdAt: '2023-07-14T17:09:40.827Z',
								updatedAt: '2023-07-14T17:09:40.827Z',
							},
						],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.visit('http://localhost:3000/search').then(() => {
						cy.wait(1000)
						cy.get("[data-cy='search-input']").click()
						cy.get("[data-cy='search-input']").type('Utilisateur DE TEST')
						cy.get("[data-cy='search-button']").click()
						// at least one result
						cy.get("[data-cy='search-result']").first().should('not.exist')
					})
				})
			})
		})

		// todo unskip when the api functionnality is ready (for filter users)
		it.skip('tests no description  - section', () => {
			cy.request({
				method: 'POST',
				url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/auth/local`,
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
					url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'DE TEST',
						first_name: 'Utilisateur',
						speciality:
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma',
						city: 'Nantes',
						action_radius: '5',
						available: true,
						description: null,
						company_artist_name: 'My Makeup Artist',
						main_picture: {
							id: 1188,
							name: 'profil.png',
							alternativeText: null,
							caption: null,
							width: 128,
							height: 128,
							formats: null,
							hash: 'profil_692f22e433',
							ext: '.png',
							mime: 'image/png',
							size: 2.33,
							url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/profil_692f22e433.png',
							previewUrl: null,
							provider: 'minio-for-strapi-v4',
							provider_metadata: null,
							createdAt: '2023-07-14T17:09:07.683Z',
							updatedAt: '2023-07-14T17:09:07.683Z',
						},
						skills: [
							{
								name: 'pieds',
							},
						],
						experiences: [
							{
								company: 'ForHives',
								job_name: 'dev',
								city: 'Nantes',
								date_start: '2021-05-01',
								date_end: '2023-05-01',
								description: 'Développement web',
							},
						],
						courses: [
							{
								diploma: 'Epsi',
								school: 'epsi',
								date_graduation: '2022-12-15',
								course_description: 'informatique',
							},
						],
						service_offers: [
							{
								name: 'Maquillage',
								price: '50€',
								description: 'Maquillage de soirée',
								options: [
									{
										name: 'Maquillage 1',
										price: '50€ 1',
										description: 'Maquillage de soirée 1',
									},
									{
										name: 'Maquillage 2',
										price: '50€ 2',
										description: 'Maquillage de soirée 2',
									},
									{
										name: 'Maquillage 3',
										price: '50€ 3',
										description: 'Maquillage de soirée 3',
									},
								],
							},
						],
						network: {},
						language: [
							{
								name: 'Anglais',
							},
						],
						image_gallery: [
							{
								id: 1189,
								name: '',
								alternativeText: null,
								caption: null,
								width: 128,
								height: 128,
								formats: null,
								hash: '_6d50597932',
								ext: '.bin',
								mime: 'application/octet-stream',
								size: 2.33,
								url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/_6d50597932.bin',
								previewUrl: null,
								provider: 'minio-for-strapi-v4',
								provider_metadata: null,
								createdAt: '2023-07-14T17:09:40.827Z',
								updatedAt: '2023-07-14T17:09:40.827Z',
							},
						],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.visit('http://localhost:3000/search').then(() => {
						cy.wait(1000)
						cy.get("[data-cy='search-input']").click()
						cy.get("[data-cy='search-input']").type('Utilisateur DE TEST')
						cy.get("[data-cy='search-button']").click()
						// at least one result
						cy.get("[data-cy='search-result']").first().should('not.exist')
					})
				})
			})
		})

		it('tests complet global not available, and complete', () => {
			cy.request({
				method: 'POST',
				url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/auth/local`,
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
					url: `${Cypress.env('NEXT_PUBLIC_API_URL')}/api/me-makeup`,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'DE TEST',
						first_name: 'Utilisateur',
						speciality:
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma',
						city: 'Nantes',
						action_radius: '5',
						available: false,
						description:
							"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience...",
						company_artist_name: 'My Makeup Artist',
						main_picture: {
							id: 1188,
							name: 'profil.png',
							alternativeText: null,
							caption: null,
							width: 128,
							height: 128,
							formats: null,
							hash: 'profil_692f22e433',
							ext: '.png',
							mime: 'image/png',
							size: 2.33,
							url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/profil_692f22e433.png',
							previewUrl: null,
							provider: 'minio-for-strapi-v4',
							provider_metadata: null,
							createdAt: '2023-07-14T17:09:07.683Z',
							updatedAt: '2023-07-14T17:09:07.683Z',
						},
						skills: [
							{
								name: 'pieds',
							},
						],
						experiences: [
							{
								company: 'ForHives',
								job_name: 'dev',
								city: 'Nantes',
								date_start: '2021-05-01',
								date_end: '2023-05-01',
								description: 'Développement web',
							},
						],
						courses: [
							{
								diploma: 'Epsi',
								school: 'epsi',
								date_graduation: '2022-12-15',
								course_description: 'informatique',
							},
						],
						service_offers: [
							{
								name: 'Maquillage',
								price: '50€',
								description: 'Maquillage de soirée',
								options: [
									{
										name: 'Maquillage 1',
										price: '50€ 1',
										description: 'Maquillage de soirée 1',
									},
									{
										name: 'Maquillage 2',
										price: '50€ 2',
										description: 'Maquillage de soirée 2',
									},
									{
										name: 'Maquillage 3',
										price: '50€ 3',
										description: 'Maquillage de soirée 3',
									},
								],
							},
						],
						network: {
							youtube: 'https://youtube.com',
							facebook: 'https://facebook.com',
							instagram: 'https://instagram.com',
							website: 'https://my-makeup.fr',
							linkedin: 'https://linkedin.com',
							email: 'test@forhives.fr',
							phone: '0606060606',
						},
						language: [
							{
								name: 'Anglais',
							},
						],
						image_gallery: [
							{
								id: 1189,
								name: '',
								alternativeText: null,
								caption: null,
								width: 128,
								height: 128,
								formats: null,
								hash: '_6d50597932',
								ext: '.bin',
								mime: 'application/octet-stream',
								size: 2.33,
								url: 'https://minio.beta.andy-cinquin.fr:443/my-makeup/_6d50597932.bin',
								previewUrl: null,
								provider: 'minio-for-strapi-v4',
								provider_metadata: null,
								createdAt: '2023-07-14T17:09:40.827Z',
								updatedAt: '2023-07-14T17:09:40.827Z',
							},
						],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.visit('http://localhost:3000/search').then(() => {
						cy.wait(1000)
						cy.get("[data-cy='search-input']").click()
						cy.get("[data-cy='search-input']").type('Utilisateur DE TEST')
						cy.get("[data-cy='search-button']").click()
						// at least one result
						cy.get("[data-cy='search-result']").should('not.exist')
					})
				})
			})
		})
	})
})
