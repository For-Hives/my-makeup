import React from 'react'

export function DescriptionProfil(props) {
	const user = props.user
	return (
		<div
			className={
				'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
			}
		>
			<h2 className={'text-xl font-bold text-slate-700'}>
				Vous en quelques mots
			</h2>
			{
				// display the user description
				// if \n is present, split the string and display each part in a new line
				user?.description.split('\n').map((item, i) => {
					return (
						<p key={i} className={'text-slate-800'}>
							{item}
						</p>
					)
				})
			}
		</div>
	)
}
