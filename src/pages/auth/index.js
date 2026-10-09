import _ from 'lodash'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { useEffect } from 'react'

function Index(_props) {
	const { data: session } = useSession()
	const router = useRouter()

	useEffect(() => {
		if (session?.user && !_.isEmpty(session.user)) {
			router.push('/auth/profil')
		} else {
			router.push('/auth/signin')
		}
	}, [])

	return <div></div>
}

export default Index
