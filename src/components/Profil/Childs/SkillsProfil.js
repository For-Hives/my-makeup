import React from 'react'

export function SkillsProfil(props) {
	const user = props.user
	return (
		<div
			className={
				'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
			}
		>
			<h2 className={'text-xl font-bold text-slate-700'}>Compétences</h2>
			<div className={'flex gap-3'}>
				<span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
					Badge
				</span>
			</div>
		</div>
	)
}
