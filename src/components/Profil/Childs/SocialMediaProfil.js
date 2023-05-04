import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import ModalUpdateSocialMediaProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateSocialMediaProfil'

export function SocialMediaProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { view } = router.query
	const mode = !!view

	const user = props.user

	const [modalUpdateSocialMediaProfil, setModalUpdateSocialMediaProfil] =
		React.useState(false)
	const handleModalUpdateSocialMediaProfil = () => {
		if (!mode) {
			setModalUpdateSocialMediaProfil(!modalUpdateSocialMediaProfil)
		}
	}

	return (
		<div className={'w-full'}>
			<ModalUpdateSocialMediaProfil
				modalUpdateSocialMediaProfil={modalUpdateSocialMediaProfil}
				handleModalUpdateSocialMediaProfil={handleModalUpdateSocialMediaProfil}
				user={user}
			/>
			<div
				className={
					(!mode ? 'group relative' : '') +
					' flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
				}
			>
				{!mode ? (
					<button
						onClick={handleModalUpdateSocialMediaProfil}
						className={
							'absolute left-0 top-0 -z-10 flex h-full w-full items-center justify-center opacity-0 ' +
							'bg-white/75 backdrop-blur-none group-hover:z-20 group-hover:opacity-100 ' +
							'pointer-events-none transition duration-300 group-hover:pointer-events-auto group-hover:backdrop-blur-[2px] ' +
							'user-select-none group-hover:user-select-auto'
						}
					>
						<div
							className={
								'btn-alt-primary flex items-center gap-3 bg-white text-indigo-900'
							}
						>
							<span className="material-symbols-rounded">edit</span>
							<span className={'font-semibold'}>
								Modifier vos informations de contacts
							</span>
						</div>
					</button>
				) : null}
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
		</div>
	)
}
