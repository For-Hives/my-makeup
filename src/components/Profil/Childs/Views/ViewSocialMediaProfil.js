import React, { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { shouldTrackContact, umamiAttributes } from '@/lib/analytics'

/**
 * @param props.user - profile attributes
 * @param [props.tracking] - `{pid, username}`, only on the public profile page:
 * contact links then carry `contact_click` Umami attributes (Strapi id and
 * channel, never the email or the phone number)
 */
function ViewSocialMediaProfil(props) {
	const [user, setUser] = React.useState(props.user ?? null)
	const [trackContacts, setTrackContacts] = React.useState(true)
	const { data: session } = useSession()

	const pid = props.tracking?.pid
	const username = props.tracking?.username
	const profileEmail = user?.network?.email
	const viewerName = session?.user?.name
	const viewerEmail = session?.user?.email

	useEffect(() => {
		if (props.user) {
			setUser(props.user)
		}
	}, [props.user])

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
			{user?.network && (
				<div className={'flex flex-col gap-3'}>
					{
						// display :
						// 	- instagram if user?.network.instagram is not null
						// 	- facebook if user?.network.facebook is not null
						// 	- linkedin if user?.network.linkedin is not null
						// 	- youtube if user?.network.youtube is not null
						// 	- email if user?.network?.email is not null
						// 	- phone if user?.network?.phone is not null
						// 	- website if user?.network.website is not null
					}
					{user?.network?.instagram && (
						<Link
							href={user?.network?.instagram}
							{...contactAttributes('instagram')}
							target={'_blank'}
							rel={'noopener nofollow noreferrer'}
							className={'group flex items-center gap-3'}
						>
							<Image
								src={'/assets/brand/037-instagram.svg'}
								className={'fill-indigo-700'}
								width={'35'}
								height={'35'}
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Instagram`}
							/>
							<p
								data-cy={'instagram'}
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
							>
								{user?.network?.instagram}
							</p>
						</Link>
					)}
					{user?.network?.facebook && (
						<Link
							href={user?.network?.facebook}
							{...contactAttributes('facebook')}
							target={'_blank'}
							rel={'noopener nofollow noreferrer'}
							className={'group flex items-center gap-3'}
						>
							<Image
								src={'/assets/brand/006-facebook.svg'}
								className={'fill-indigo-700'}
								width={'35'}
								height={'35'}
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Facebook`}
							/>
							<p
								data-cy={'facebook'}
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
							>
								{user?.network?.facebook}
							</p>
						</Link>
					)}
					{user?.network?.linkedin && (
						<Link
							href={user?.network?.linkedin}
							{...contactAttributes('linkedin')}
							target={'_blank'}
							rel={'noopener nofollow noreferrer'}
							className={'group flex items-center gap-3'}
						>
							<Image
								src={'/assets/brand/030-linkedin.svg'}
								className={'fill-indigo-700'}
								width={'35'}
								height={'35'}
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Linkedin`}
							/>
							<p
								data-cy={'linkedin'}
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
							>
								{user?.network?.linkedin}
							</p>
						</Link>
					)}
					{user?.network?.youtube && (
						<Link
							href={user?.network?.youtube}
							{...contactAttributes('youtube')}
							target={'_blank'}
							rel={'noopener nofollow noreferrer'}
							className={'group flex items-center gap-3'}
						>
							<Image
								src={'/assets/brand/033-youtube.svg'}
								className={'fill-indigo-700'}
								width={'35'}
								height={'35'}
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Youtube`}
							/>
							<p
								data-cy={'youtube'}
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
							>
								{user?.network?.youtube}
							</p>
						</Link>
					)}
					{user?.network?.email && (
						<Link
							href={`mailto:${user?.network?.email}`}
							{...contactAttributes('email')}
							rel={'noopener nofollow noreferrer'}
							className={'group flex items-center gap-3'}
						>
							<Image
								src={'/assets/brand/050-email.svg'}
								className={'fill-indigo-700'}
								width={'35'}
								height={'35'}
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Email`}
							/>
							<p
								data-cy={'email'}
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
							>
								{user?.network?.email}
							</p>
						</Link>
					)}
					{user?.network?.phone && (
						<Link
							href={`tel:${user?.network?.phone}`}
							{...contactAttributes('phone')}
							rel={'noopener nofollow noreferrer'}
							className={'group flex items-center gap-3'}
						>
							<Image
								src={'/assets/brand/051-phone.svg'}
								className={'fill-indigo-700'}
								width={'35'}
								height={'35'}
								alt={`${user?.network?.phone} ${user?.network?.phone} Téléphone`}
							/>
							<p
								data-cy={'phone'}
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
							>
								{user?.network?.phone}
							</p>
						</Link>
					)}
					{user?.network?.website && (
						<Link
							href={user?.network?.website}
							{...contactAttributes('website')}
							target={'_blank'}
							rel={'noopener nofollow noreferrer'}
							className={'group flex items-center gap-3'}
						>
							<Image
								src={'/assets/brand/052-website.svg'}
								className={'fill-indigo-700'}
								width={'35'}
								height={'35'}
								alt={`${user?.user?.first_name} ${user?.user?.last_name} - site internet`}
							/>
							<p
								data-cy={'website'}
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
							>
								{user?.network?.website}
							</p>
						</Link>
					)}
				</div>
			)}
		</div>
	)
}

export default ViewSocialMediaProfil
