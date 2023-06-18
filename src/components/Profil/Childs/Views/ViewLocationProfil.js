import React from 'react'

function ViewLocationProfil(props) {
	const user = props.user
	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-slate-700'}>
				Localisation & département
			</h2>
			<div className={'flex gap-2'}>
				<span className="material-icons-round text-lg text-indigo-900">
					location_on
				</span>
				<div className={'flex flex-col gap-2'}>
					<h3 className={'text-lg font-semibold text-slate-700'}>
						Localisation
					</h3>
					<p className={'text-slate-800'}>{props.user?.city}</p>
				</div>
			</div>
			<div className={'flex gap-2'}>
				<span className="material-icons-round text-lg text-indigo-900">
					<span className="material-symbols-outlined">directions_run</span>
				</span>
				<div className={'flex flex-col gap-2'}>
					<h3 className={'text-lg font-semibold text-slate-700'}>
						Peut travailer chez vous à
					</h3>
					<p className={'text-slate-800'}>
						{props.user?.city} & {props.user?.action_radius}km autour
					</p>
				</div>
			</div>
		</div>
	)
}

export default ViewLocationProfil