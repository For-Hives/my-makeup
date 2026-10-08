/**
 * Signal that aborts a fetch after `ms`, in every browser of the artists.
 * AbortSignal.timeout() only exists from Safari 16: on iOS 15 calling it
 * throws, and the forgotten password pages answered « service
 * indisponible » to every request. There, an AbortController and a timer do
 * the same; without AbortController (Safari < 12.1) the fetch runs without
 * a time limit.
 * @param {number} ms
 * @param {object} [env] - globalThis; another object in the tests
 * @returns {AbortSignal|undefined}
 */
export function signalAvecDelai(ms, env = globalThis) {
	if (typeof env.AbortSignal?.timeout === 'function')
		return env.AbortSignal.timeout(ms)
	if (typeof env.AbortController !== 'function') return undefined
	const controleur = new env.AbortController()
	env.setTimeout(() => controleur.abort(), ms)
	return controleur.signal
}
