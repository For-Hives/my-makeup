import React from 'react'

export function ExperiencesProfil(props) {
	const user = props.user
	return (
		<div
			className={
				'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
			}
		>
			<h2 className={'text-xl font-bold text-slate-700'}>
				Expériences professionnelles
			</h2>
		</div>
	)
}
