import React from 'react'
import { InformationCircleIcon } from '@heroicons/react/20/solid'

function Info({ description }) {
	return (
		<div className="rounded-md bg-indigo-50 p-4">
			<div className="flex">
				<div className="flex-shrink-0">
					<InformationCircleIcon
						className="h-5 w-5 text-indigo-400"
						aria-hidden="true"
					/>
				</div>
				<div className="ml-3">
					<div className="text-sm text-indigo-700">
						<p>{description}</p>
					</div>
				</div>
			</div>
		</div>
	)
}

export default Info
