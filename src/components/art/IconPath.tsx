/**
 * One path of the icon pack, drawn: a filled path on the 24 grid in `currentColor`. The component a client component
 * uses, with the constant of the icon it draws (`ICON_CLOSE`, from `icons.ts`), so that it ships that path and not the
 * whole pack. A server component draws by name with `Icon`.
 */
export function IconPath({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
	return (
		<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor" className={className}>
			<path fillRule="evenodd" d={d} />
		</svg>
	)
}
