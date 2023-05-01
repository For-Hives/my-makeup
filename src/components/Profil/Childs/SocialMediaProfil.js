import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

export function SocialMediaProfil(props) {
	const user = props.user
	return (
		<div
			className={
				'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
			}
		>
			<h2 className={'text-xl font-bold text-slate-700'}>
				Réseaux sociaux & contacts
			</h2>
			<div className={'flex flex-col gap-3'}>
				{
					// display :
					// 	- instagram if user?.network.instagram is not null
					// 	- facebook if user?.network.facebook is not null
					// 	- linkedin if user?.network.linkedin is not null
					// 	- youtube if user?.network.youtube is not null
					// 	- email if user?.user?.email is not null
					// 	- phone if user?.user?.phone is not null
					// 	- website if user?.network.website is not null
				}
				{user?.network.instagram && (
					<Link
						href={user?.network.instagram}
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
						<p className={'text-sm text-slate-700 group-hover:underline'}>
							{user?.network.instagram}
						</p>
					</Link>
				)}
				{user?.network.facebook && (
					<Link
						href={user?.network.facebook}
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
						<p className={'text-sm text-slate-700 group-hover:underline'}>
							{user?.network.facebook}
						</p>
					</Link>
				)}
				{user?.network.linkedin && (
					<Link
						href={user?.network.linkedin}
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
						<p className={'text-sm text-slate-700 group-hover:underline'}>
							{user?.network.linkedin}
						</p>
					</Link>
				)}
				{user?.network.youtube && (
					<Link
						href={user?.network.youtube}
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
						<p className={'text-sm text-slate-700 group-hover:underline'}>
							{user?.network.youtube}
						</p>
					</Link>
				)}
				{user?.user?.email && (
					<Link
						href={`mailto:${user?.user?.email}`}
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
						<p className={'text-sm text-slate-700 group-hover:underline'}>
							{user?.user?.email}
						</p>
					</Link>
				)}
				{user?.phone && (
					<Link
						href={`tel:${user?.phone}`}
						rel={'noopener nofollow noreferrer'}
						className={'group flex items-center gap-3'}
					>
						<Image
							src={'/assets/brand/051-phone.svg'}
							className={'fill-indigo-700'}
							width={'35'}
							height={'35'}
							alt={`${user?.phone} ${user?.phone} Téléphone`}
						/>
						<p className={'text-sm text-slate-700 group-hover:underline'}>
							{user?.phone}
						</p>
					</Link>
				)}
				{user?.network.website && (
					<Link
						href={user?.network.website}
						target={'_blank'}
						rel={'noopener nofollow noreferrer'}
						className={'group flex items-center gap-3'}
					>
						<Image
							src={'/assets/brand/052-website.svg'}
							className={'fill-indigo-700'}
							width={'35'}
							height={'35'}
							alt={`${user?.user?.first_name} ${user?.user?.last_name} website`}
						/>
						<p className={'text-sm text-slate-700 group-hover:underline'}>
							{user?.network.website}
						</p>
					</Link>
				)}
			</div>
		</div>
	)
}
