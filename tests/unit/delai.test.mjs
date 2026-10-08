import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signalAvecDelai } from '../../src/lib/delai.js'

test('AbortSignal.timeout when the browser has it', () => {
	const appels = []
	const env = {
		AbortSignal: { timeout: ms => (appels.push(ms), 'signal natif') },
		AbortController,
		setTimeout: () => assert.fail('no timer needed'),
	}
	assert.equal(signalAvecDelai(15_000, env), 'signal natif')
	assert.deepEqual(appels, [15_000])
})

test('iOS 15 (no AbortSignal.timeout): an AbortController aborted by a timer', () => {
	const minuteries = []
	const env = {
		AbortSignal: {},
		AbortController,
		setTimeout: (fonction, ms) => minuteries.push({ fonction, ms }),
	}
	const signal = signalAvecDelai(15_000, env)
	assert.equal(signal.aborted, false)
	assert.deepEqual(
		minuteries.map(m => m.ms),
		[15_000]
	)
	minuteries[0].fonction()
	assert.equal(signal.aborted, true)
})

test('no AbortController at all: no signal, the fetch still runs', () => {
	assert.equal(signalAvecDelai(15_000, {}), undefined)
})

test('the real one aborts after the delay', async () => {
	const signal = signalAvecDelai(5)
	assert.equal(signal.aborted, false)
	await new Promise(resolve => setTimeout(resolve, 30))
	assert.equal(signal.aborted, true)
})
