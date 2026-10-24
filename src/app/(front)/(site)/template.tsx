import { type ReactNode, ViewTransition } from 'react'

// The page transition of the public pages (issue 1087). A template, unlike a layout, is mounted again on every
// navigation to another page, so React runs the enter and exit of this `<ViewTransition>` through the browser's
// View Transitions API (the classes are styled in globals.css, « Page transition »). It does nothing by default:
// a filter change on the same page, a refresh or a Suspense reveal never animate. This is a Server Component: no
// JavaScript of ours is sent; a browser without the API, or reduced motion, navigates as usual.
export default function SiteTemplate({ children }: { children: ReactNode }) {
	return (
		<ViewTransition default="none" enter="page-in" exit="page-out">
			{children}
		</ViewTransition>
	)
}
