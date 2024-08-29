import React, { useEffect } from 'react'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import _ from 'lodash'

function Index(props) {
	const { data: session } = useSession()
	const router = useRouter()

	useEffect(() => {
		if (session && session.user && !_.isEmpty(session.user)) {
			router.push('/auth/profil')
		} else {
			router.push('/auth/signin')
		}
	}, [])

	return <div></div>
}

export default Index
