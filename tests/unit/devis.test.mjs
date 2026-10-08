import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDevisHref, devisFormUrl } from '../../src/lib/devis.js'

const FORM = 'https://form.example.test/devis'

describe('devisFormUrl', () => {
	test('no variable, no form', () => {
		assert.equal(devisFormUrl(undefined), null)
		assert.equal(devisFormUrl(''), null)
		assert.equal(devisFormUrl('   '), null)
	})

	test('only plain https URLs are accepted', () => {
		assert.equal(devisFormUrl(FORM), FORM)
		assert.equal(
			devisFormUrl(' https://form.example.test/r/abc?lang=fr '),
			'https://form.example.test/r/abc?lang=fr'
		)
		assert.equal(devisFormUrl('http://form.example.test/devis'), null)
		assert.equal(devisFormUrl('javascript:alert(1)'), null)
		assert.equal(devisFormUrl('https://user:pass@form.example.test/'), null)
		assert.equal(devisFormUrl('/devis'), null)
	})
})

describe('buildDevisHref', () => {
	test('null when the form is not configured', () => {
		assert.equal(
			buildDevisHref({ formUrl: undefined, slug: 'test-maq', pid: 3 }),
			null
		)
		assert.equal(buildDevisHref({ formUrl: FORM, slug: '', pid: 3 }), null)
	})

	test('carries profile, id and source', () => {
		const url = new URL(
			buildDevisHref({ formUrl: FORM, slug: 'Test Maq', pid: 3 })
		)
		assert.equal(url.origin + url.pathname, FORM)
		assert.equal(url.searchParams.get('profil'), 'Test Maq')
		assert.equal(url.searchParams.get('pid'), '3')
		assert.equal(url.searchParams.get('source'), 'profil')
		assert.equal(url.searchParams.get('referent'), null)
	})

	test('keeps utm parameters of the page and nothing else', () => {
		const url = new URL(
			buildDevisHref({
				formUrl: FORM,
				slug: 'test-maq',
				pid: 3,
				search:
					'?utm_source=instagram&utm_medium=bio&utm_campaign=bio-3&utm_term=&utm_content=story&fbclid=XYZ&search=mariage',
			})
		)
		assert.equal(url.searchParams.get('utm_source'), 'instagram')
		assert.equal(url.searchParams.get('utm_medium'), 'bio')
		assert.equal(url.searchParams.get('utm_campaign'), 'bio-3')
		assert.equal(url.searchParams.get('utm_content'), 'story')
		assert.equal(url.searchParams.has('utm_term'), false)
		assert.equal(url.searchParams.has('fbclid'), false)
		assert.equal(url.searchParams.has('search'), false)
	})

	test('drops utm values that look personal and caps their length', () => {
		const url = new URL(
			buildDevisHref({
				formUrl: FORM,
				slug: 'test-maq',
				pid: 3,
				search: `?utm_source=a@b.fr&utm_medium=0612345678&utm_campaign=${'x'.repeat(300)}`,
			})
		)
		assert.equal(url.searchParams.has('utm_source'), false)
		assert.equal(url.searchParams.has('utm_medium'), false)
		assert.equal(url.searchParams.get('utm_campaign').length, 100)
	})

	test('sends the referrer domain only', () => {
		const url = new URL(
			buildDevisHref({
				formUrl: FORM,
				slug: 'test-maq',
				pid: 3,
				referrer: 'https://www.google.com/search?q=maquilleuse+annecy',
			})
		)
		assert.equal(url.searchParams.get('referent'), 'www.google.com')
		assert.equal(url.toString().includes('annecy'), false)
	})

	test('keeps the parameters already in the form URL and drops an invalid pid', () => {
		const url = new URL(
			buildDevisHref({ formUrl: `${FORM}?lang=fr`, slug: 'test-maq', pid: 'x' })
		)
		assert.equal(url.searchParams.get('lang'), 'fr')
		assert.equal(url.searchParams.has('pid'), false)
		assert.equal(url.searchParams.get('profil'), 'test-maq')
	})
})
