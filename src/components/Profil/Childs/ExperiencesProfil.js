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
			<div className={'flex flex-wrap gap-4'}>
				{/* map on experiences */}
				{
					// company
					// job_name
					// city
					// date_start
					// date_end
					// description
				}
				<div className={'flex flex-col gap-4'}>
					{user?.experiences?.map((experience, index) => {
						return (
							<div key={index} className={'flex text-indigo-800'}>
								<span className="material-icons-round">apartment</span>
								<div className={'ml-2 flex flex-col gap-2'}>
									<div className={'flex flex-col'}>
										<p className={'font-semibold text-slate-700'}>
											{experience.company}
										</p>
										<div className={'flex justify-between'}>
											<p className={'text-sm italic text-slate-600'}>
												{experience.job_name}
											</p>
											<p className={'text-sm italic text-slate-600'}>
												{/* format date to month year ( like july 1998 )  */}
												{/*{experience.date_start} - {experience.date_end}*/}
												{new Date(experience.date_start).toLocaleString(
													'default',
													{
														year: 'numeric',
														month: 'long',
													}
												)}
												{' - '}
												{new Date(experience.date_end).toLocaleString(
													'default',
													{
														year: 'numeric',
														month: 'long',
													}
												)}
											</p>
										</div>
									</div>
									<div>
										<p className={'text-sm italic text-slate-500'}>
											{experience.description}
										</p>
									</div>
								</div>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
