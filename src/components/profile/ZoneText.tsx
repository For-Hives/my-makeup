/**
 * Where a makeup artist works, as the page shows it (ticket 264; PLAN-ZONES.md §3.4): the text of the
 * zone, preceded by the flag of each of her countries when she works abroad. The flag is a decoration in
 * its own `span`, hidden from screen readers; the name of the country is always in the text. This is the
 * only place a flag is rendered: no title, description, structured data or search text holds one.
 *
 * For a commune there are no flags and the component gives the text alone, so the HTML of a commune is
 * what it was.
 */
export function ZoneText({ text, flags = [] }: { text: string; flags?: readonly string[] }) {
	if (flags.length === 0) return text
	return (
		<>
			<span aria-hidden="true">{flags.join(' ')}</span>
			{` ${text}`}
		</>
	)
}
