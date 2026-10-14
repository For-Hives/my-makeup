/** The few icons the blocks draw, inline (heroicons 20 and 24, MIT) so that the site needs no icon package. */

interface PropsIcone {
	className?: string
}

export function IconeLoupe({ className }: PropsIcone) {
	return (
		<svg aria-hidden="true" className={className} viewBox="0 0 20 20" fill="currentColor">
			<path
				fillRule="evenodd"
				d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
				clipRule="evenodd"
			/>
		</svg>
	)
}

export function IconeLieu({ className }: PropsIcone) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
			/>
		</svg>
	)
}

export function IconeCoeur({ className }: PropsIcone) {
	return (
		<svg aria-hidden="true" className={className} viewBox="0 0 20 20" fill="currentColor">
			<path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 0 1-.69.001l-.002-.001Z" />
		</svg>
	)
}

export function IconeEtoile({ className }: PropsIcone) {
	return (
		<svg aria-hidden="true" className={className} viewBox="0 0 20 20" fill="currentColor">
			<path
				fillRule="evenodd"
				d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
				clipRule="evenodd"
			/>
		</svg>
	)
}
