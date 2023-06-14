import React from 'react'

function ViewCoursesProfil(props) {
	const user = props.user
	return (
		<div className={'flex flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-slate-700'}>
				Formations & diplomes
			</h2>
			{user?.courses?.map((course, index) => {
				return (
					<div key={index} className={'flex text-slate-700'}>
						<span className="material-icons-round text-indigo-900">school</span>
						<div className={'ml-2 flex w-full flex-col gap-2'}>
							<div className={'flex flex-col'}>
								<p className={'font-semibold text-slate-700'}>
									{course.diploma}
								</p>
								<div className={'flex w-full justify-between'}>
									<p className={'text-sm italic text-slate-600'}>
										{course.school}
									</p>
									<p className={'text-sm italic text-slate-600'}>
										{course.date_graduation}
									</p>
								</div>
							</div>
							<div>
								{
									// display the user description
									// if \n is present, split the string and display each part in a new line
									course.course_description.split('\n').map((item, i) => {
										return (
											<p key={i} className={'text-sm italic text-slate-500'}>
												{item}
											</p>
										)
									})
								}
							</div>
						</div>
					</div>
				)
			})}
		</div>
	)
}

export default ViewCoursesProfil
