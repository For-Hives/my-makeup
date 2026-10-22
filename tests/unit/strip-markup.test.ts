import { describe, expect, test } from 'bun:test'
import { stripMarkup } from '@/lib/html/strip-markup'
import { saltBcrypt } from '../support/source-strapi/creation'

const TEXT = { dropContentOf: ['script', 'style'] }

describe('stripMarkup', () => {
	test('drops scripts and styles with their content, whatever the case and the end tag', () => {
		expect(stripMarkup('a<SCRIPT>x()</SCRIPT>b', TEXT)).toBe('ab')
		expect(stripMarkup('a<script>x()</script\t\n bar>b', TEXT)).toBe('ab')
		expect(stripMarkup('a<style media="a>b">p{}</STYLE >b', TEXT)).toBe('ab')
		expect(stripMarkup('a<script>never closed', TEXT)).toBe('a')
	})

	test('does not rebuild a tag from the pieces that are left', () => {
		expect(stripMarkup('<<b>script>alert(1)</script>', TEXT)).not.toContain('</script')
		expect(stripMarkup('<scr<!-- -->ipt>alert(1)</script>', TEXT)).not.toContain('<script')
		expect(stripMarkup('<!<!-- -->-- x -->', TEXT)).not.toContain('<!--')
		expect(stripMarkup('<scr<script></script>ipt>x</script>', TEXT)).not.toContain('<script')
	})

	test('keeps a lone « < » as text, and can keep the other tags', () => {
		expect(stripMarkup('3 < 5 <b>ok</b>', TEXT)).toBe('3 < 5 ok')
		expect(stripMarkup('<p>a</p><script>x</script><!-- c -->', { ...TEXT, keepTags: true })).toBe('<p>a</p>')
	})

	test('writes line breaks for blocks and br, or a replacement text', () => {
		expect(stripMarkup('<p>a</p><p>b<br/>c</p>', { lineBreaks: true })).toBe('a\nb\nc\n')
		expect(stripMarkup('a<i>b</i>c', { tagText: ' ' })).toBe('a b c')
	})
})

describe('saltBcrypt', () => {
	test('is repeatable, valid for bcrypt, and differs per account', () => {
		expect(saltBcrypt(7)).toBe(saltBcrypt(7))
		expect(saltBcrypt(7)).not.toBe(saltBcrypt(8))
		expect(saltBcrypt(7)).toMatch(/^\$2a\$\d\d\$[./A-Za-z0-9]{22}$/)
	})
})
