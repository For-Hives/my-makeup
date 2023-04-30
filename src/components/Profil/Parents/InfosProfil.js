import React from 'react'
import { LocationProfil } from '@/components/Profil/Childs/LocationProfil'
import { DescriptionProfil } from '@/components/Profil/Childs/DescriptionProfil'
import { SocialMediaProfil } from '@/components/Profil/Childs/SocialMediaProfil'
import { SkillsProfil } from '@/components/Profil/Childs/SkillsProfil'

function InfosProfil(props) {
	const user = props.user
	return (
		<div className={''}>
			<div className="mx-auto max-w-7xl">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div className={'col-span-4 flex flex-col items-start gap-5'}>
						<LocationProfil user={user} />
						<SocialMediaProfil user={user} />
						<SkillsProfil user={user} />
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
