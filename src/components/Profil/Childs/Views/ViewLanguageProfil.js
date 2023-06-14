import React from 'react'

function ViewLanguageProfil(props) {
	const user = props.user
	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-slate-700'}>Langues</h2>
			<ul className={'flex flex-col gap-4'}>
				{/* map on language -> name */}
				{user?.language?.map((language, index) => {
					return (
						<li key={index} className={'text-slate-700'}>
							→&nbsp;
							<div className="inline-flex flex-nowrap items-center rounded-full px-3 py-2 text-sm font-medium text-slate-700">
								{language.name}
							</div>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

export default ViewLanguageProfil
