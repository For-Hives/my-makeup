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
			<div className={'flex flex-wrap gap-4'}>
				{/* map on skills -> name */}
				{user.skills.map((skill, index) => {
					return (
						<div
							key={index}
							className="inline-flex flex-nowrap items-center rounded-full bg-indigo-100 px-3 py-2 text-xs font-medium text-indigo-700"
						>
							{skill.name}
						</div>
					)
				})}
			</div>
		</div>
	)
}
