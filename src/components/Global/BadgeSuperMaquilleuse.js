import { FireIcon } from '@heroicons/react/24/outline'
import React from 'react'

export function BadgeSuperMaquilleuse() {
	return (
		<div
			className={
				'w-full rounded-lg bg-white px-3 text-center shadow ' +
				'flex items-center justify-center py-1 text-xs font-medium italic text-indigo-900/90'
			}
		>
			<FireIcon className={'mr-2 h-4 w-4 text-indigo-900'} />
			Super maquilleuse
		</div>
	)
}
