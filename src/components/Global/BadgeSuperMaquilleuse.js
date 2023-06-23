import { FireIcon } from '@heroicons/react/24/outline'
import React from 'react'

export function BadgeSuperMaquilleuse() {
	return (
		<div
			className={
				'w-full rounded-r-lg bg-fuchsia-700 px-3 text-center shadow-xl ' +
				'flex items-center justify-center py-1 text-sm font-medium italic text-white'
			}
		>
			<FireIcon className={'mr-2 h-4 w-4 text-white'} />
			Pro
		</div>
	)
}
