import React from 'react'
import { LocationProfil } from '@/components/Profil/LocationProfil'
import { DescriptionProfil } from '@/components/Profil/DescriptionProfil'
import { SocialMediaProfil } from '@/components/Profil/SocialMediaProfil'

function InfosProfil(props) {
	const user = props.user
	return (
		<div className={''}>
			<div className="mx-auto max-w-7xl">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div className={'col-span-4 flex flex-col items-start gap-5'}>
						<LocationProfil user={user} />
						<SocialMediaProfil user={user} />
					</div>
					<div className={'col-span-8 flex items-start'}>
						<DescriptionProfil user={user} />
					</div>
				</div>
			</div>
		</div>
	)
}

export default InfosProfil
