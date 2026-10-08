import { ligneLogAuth, secretNextAuth } from '@/lib/auth-session'

/**
 * Runs once when the Next server starts: a production server without
 * NEXTAUTH_SECRET stops right away (AUTH-14) instead of signing sessions
 * with « undefined ». Next only logs a failing hook and keeps serving, hence
 * the exit: the deployment fails and the previous container stays up.
 */
export function register() {
	if (process.env.NEXT_RUNTIME !== 'nodejs') return
	try {
		secretNextAuth({
			secret: process.env.NEXTAUTH_SECRET,
			nodeEnv: process.env.NODE_ENV,
			phase: process.env.NEXT_PHASE,
		})
	} catch (erreur) {
		console.error(ligneLogAuth('config', { code: 'secret_manquant' }))
		console.error(erreur.message)
		process.exit(1)
	}
}
