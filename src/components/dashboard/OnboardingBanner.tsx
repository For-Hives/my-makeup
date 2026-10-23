import { ACCOUNT_ONBOARDING_PAGE } from '@/lib/auth/return-to'
import { type OnboardingStep, STEPS_NAMES } from '@/lib/dashboard/onboarding'

/** The sentence of the banner: « Il te reste 2 étapes pour être visible. » (ticket 296). */
export function remainingStepsText(reste: number): string {
	return `Il te reste ${reste} ${reste === 1 ? 'étape' : 'étapes'} pour être visible.`
}

/**
 * At the top of her space, while the three steps of the onboarding are not all done (ticket 296):
 * how many remain, and a link that resumes at the first one. A server component: the page decides
 * whether to show it (not for a hidden page nor an internal account).
 */
export function OnboardingBanner({ reste, premiere }: { reste: number; premiere: OnboardingStep }) {
	return (
		<section
			aria-label="Il reste des étapes"
			data-testid="bandeau-accueil"
			data-restantes={reste}
			data-premiere={premiere}
			className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 rounded border border-indigo-300 bg-indigo-50 p-4"
		>
			<p className="font-medium text-indigo-950">{remainingStepsText(reste)}</p>
			<a
				href={ACCOUNT_ONBOARDING_PAGE}
				className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
			>
				Reprendre
				<span className="sr-only"> à l’étape « {STEPS_NAMES[premiere]} »</span>
			</a>
		</section>
	)
}
