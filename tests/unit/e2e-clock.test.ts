import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

/**
 * `page.clock.install()` alone leaves the time running at its own pace: a delay played with `runFor` is then also
 * eaten by the real time the test takes, and on a loaded runner a 200 ms menu closes before the test looks at it
 * (e2e 3/5, 25/10/2026). A spec that installs the clock pauses it too (`pauseAt`).
 */
describe('Les essais qui installent l’horloge la mettent en pause', () => {
	test('tout fichier qui appelle clock.install appelle aussi clock.pauseAt', async () => {
		const missing: string[] = []
		for await (const file of new Glob('tests/e2e/**/*.ts').scan('.')) {
			const text = await Bun.file(file).text()
			if (text.includes('clock.install(') && !text.includes('clock.pauseAt(')) missing.push(file)
		}
		expect(missing).toEqual([])
	})
})
