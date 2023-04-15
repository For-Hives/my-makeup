export class StrapiService {
	async authenticate(credentials) {
		try {
			const response = await fetch(`https://api.my-makeup.fr/api/auth/local`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: {
					identifier: credentials.email,
					password: credentials.password,
				},
			})

			if (response.ok) {
				const data = await response.json()
				return data.user
			} else {
				console.error(`Error: ${response.status} ${response.statusText}`)
				return null
			}
		} catch (error) {
			console.error('Error:', error)
			throw error
		}
	}
}
