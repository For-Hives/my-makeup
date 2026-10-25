interface DecorProps {
	className?: string
}

/** The ellipse that rings the current link, hand-drawn, one stroke and a lighter echo. No star. */
export function SwirlEllipse({ className = 'h-full w-full' }: DecorProps) {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 124 54"
			preserveAspectRatio="none"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.1"
			strokeLinecap="round"
			className={className}
		>
			<path d="M14 36C6 22 34 6 66 6C98 6 120 16 112 30C104 44 68 50 38 46C16 43 6 36 12 28" />
			<path d="M20 40C14 30 34 14 62 12" opacity=".45" />
		</svg>
	)
}
