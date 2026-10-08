import React, { useEffect } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { shouldTrackContact, umamiAttributes } from '@/lib/analytics'
import { contacts, libelleCanal } from '@/lib/profil/vue-publique'

const ICONES = {
	instagram: '/assets/brand/037-instagram.svg',
	facebook: '/assets/brand/006-facebook.svg',
	linkedin: '/assets/brand/030-linkedin.svg',
	youtube: '/assets/brand/033-youtube.svg',
	email: '/assets/brand/050-email.svg',
	phone: '/assets/brand/051-phone.svg',
	website: '/assets/brand/052-website.svg',
}

// networks and websites open in a new tab, mailto: and tel: do not
const NOUVEL_ONGLET = new Set([
	'instagram',
	'facebook',
	'linkedin',
	'youtube',
	'website',
])

/**
 * @param props.user - profile attributes
 * @param [props.tracking] - `{pid, username}`, only on the public profile page:
 * contact links then carry `contact_click` Umami attributes (Strapi id and
 * channel, never the email or the phone number)
 */
function ViewSocialMediaProfil(props) {
	const [trackContacts, setTrackContacts] = React.useState(true)
	const { data: session } = useSession()

	// read from the props only, so the public profile is in the server HTML
	const liens = contacts(props.user?.network)
	const pid = props.tracking?.pid
	const username = props.tracking?.username
	const profileEmail = props.user?.network?.email
	const viewerName = session?.user?.name
	const viewerEmail = session?.user?.email

	useEffect(() => {
		if (pid === undefined) return
		setTrackContacts(
			shouldTrackContact({
				profile: { username, email: profileEmail },
				viewer: { name: viewerName, email: viewerEmail },
				search: window.location.search,
				referrer: document.referrer,
				origin: window.location.origin,
			})
		)
	}, [pid, username, profileEmail, viewerName, viewerEmail])

	const contactAttributes = channel =>
		pid !== undefined && trackContacts
			? umamiAttributes('contact_click', { pid, channel })
			: {}

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>
				Réseaux sociaux & contacts
			</h2>
			{liens.length > 0 && (
				<div className={'flex flex-col gap-3'}>
					{liens.map(({ canal, libelle, href }) => {
						const contenu = (
							<>
								<Image
									src={ICONES[canal]}
									className={'fill-indigo-700'}
									width={'35'}
									height={'35'}
									alt={libelleCanal(canal)}
								/>
								<p
									data-cy={canal}
									className={
										'overflow-hidden text-sm text-gray-700 group-hover:underline'
									}
								>
									{libelle}
								</p>
							</>
						)
						return href ? (
							<a
								key={canal}
								href={href}
								{...contactAttributes(canal)}
								{...(NOUVEL_ONGLET.has(canal) ? { target: '_blank' } : {})}
								rel={'noopener nofollow noreferrer'}
								className={'group flex items-center gap-3'}
							>
								{contenu}
							</a>
						) : (
							<div key={canal} className={'flex items-center gap-3'}>
								{contenu}
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

export default ViewSocialMediaProfil
