import React, { useEffect } from 'react'

import Image from 'next/image'
import Link from 'next/link'

function ViewSocialMediaProfil(props) {
	const [user, setUser] = React.useState(null)

	useEffect(() => {
		if (props.user) {
			setUser(props.user)
		}
	}, [props.user])

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
							className={'group flex items-center gap-3'}
							href={user?.network?.instagram}
							rel={'noopener nofollow noreferrer'}
							target={'_blank'}
						>
							<Image
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Instagram`}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/037-instagram.svg'}
								width={'35'}
							/>
							<p
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
								data-cy={'instagram'}
							>
								{user?.network?.instagram}
							</p>
						</Link>
					)}
					{user?.network?.facebook && (
						<Link
							className={'group flex items-center gap-3'}
							href={user?.network?.facebook}
							rel={'noopener nofollow noreferrer'}
							target={'_blank'}
						>
							<Image
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Facebook`}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/006-facebook.svg'}
								width={'35'}
							/>
							<p
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
								data-cy={'facebook'}
							>
								{user?.network?.facebook}
							</p>
						</Link>
					)}
					{user?.network?.linkedin && (
						<Link
							className={'group flex items-center gap-3'}
							href={user?.network?.linkedin}
							rel={'noopener nofollow noreferrer'}
							target={'_blank'}
						>
							<Image
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Linkedin`}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/030-linkedin.svg'}
								width={'35'}
							/>
							<p
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
								data-cy={'linkedin'}
							>
								{user?.network?.linkedin}
							</p>
						</Link>
					)}
					{user?.network?.youtube && (
						<Link
							className={'group flex items-center gap-3'}
							href={user?.network?.youtube}
							rel={'noopener nofollow noreferrer'}
							target={'_blank'}
						>
							<Image
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Youtube`}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/033-youtube.svg'}
								width={'35'}
							/>
							<p
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
								data-cy={'youtube'}
							>
								{user?.network?.youtube}
							</p>
						</Link>
					)}
					{user?.network?.email && (
						<Link
							className={'group flex items-center gap-3'}
							href={`mailto:${user?.network?.email}`}
							rel={'noopener nofollow noreferrer'}
						>
							<Image
								alt={`${user?.user?.first_name} ${user?.user?.last_name} Email`}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/050-email.svg'}
								width={'35'}
							/>
							<p
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
								data-cy={'email'}
							>
								{user?.network?.email}
							</p>
						</Link>
					)}
					{user?.network?.phone && (
						<Link
							className={'group flex items-center gap-3'}
							href={`tel:${user?.network?.phone}`}
							rel={'noopener nofollow noreferrer'}
						>
							<Image
								alt={`${user?.network?.phone} ${user?.network?.phone} Téléphone`}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/051-phone.svg'}
								width={'35'}
							/>
							<p
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
								data-cy={'phone'}
							>
								{user?.network?.phone}
							</p>
						</Link>
					)}
					{user?.network?.website && (
						<Link
							className={'group flex items-center gap-3'}
							href={user?.network?.website}
							rel={'noopener nofollow noreferrer'}
							target={'_blank'}
						>
							<Image
								alt={`${user?.user?.first_name} ${user?.user?.last_name} - site internet`}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/052-website.svg'}
								width={'35'}
							/>
							<p
								className={
									'overflow-hidden text-sm text-gray-700 group-hover:underline'
								}
								data-cy={'website'}
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
