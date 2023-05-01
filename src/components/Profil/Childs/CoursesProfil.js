import React from 'react'

export function CoursesProfil(props) {
	const user = props.user
	return (
		<div
			className={
				'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
			}
		>
			<h2 className={'text-xl font-bold text-slate-700'}>
				Formations & diplomes
			</h2>
			<div className={'flex flex-col gap-4'}>
				{user?.courses?.map((course, index) => {
					return (
						<div key={index} className={'flex text-slate-700'}>
							<span className="material-symbols-rounded">school</span>
							<div className={'ml-2 flex flex-col gap-2'}>
								<div className={'flex flex-col'}>
									<p className={'font-semibold text-slate-700'}>
										{course.diploma}
									</p>
									<div className={'flex justify-between'}>
										<p className={'text-sm italic text-slate-600'}>
											{course.school}
										</p>
										<p className={'text-sm italic text-slate-600'}>
											{course.date_graduation}
										</p>
									</div>
								</div>
								<div>
									<p className={'text-sm italic text-slate-500'}>
										{course.course_description}
									</p>
								</div>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
