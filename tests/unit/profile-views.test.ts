import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { runDailyTasks } from '@/lib/tasks/daily'
import { purgeProfileViews } from '@/lib/tasks/profile-views'
import { isAutomatedAgent, lastViewDays, readViewBody, viewsPurgeDay } from '@/lib/views/profile-views'
import { reportProfileView } from '@/lib/views/report-view'
import { aggregateViews, parisDayBefore, WeeklyStats } from '@/lib/weekly-stats'

/** Ticket 1001: the daily counter of the views of a profile. The same lines against the real store: tests/integration/profile-views.test.ts. */

describe('the body of a count', () => {
	test('a slug alone is read', () => {
		expect(readViewBody({ slug: 'marie-fictive' })).toEqual({ slug: 'marie-fictive' })
	})

	test.each([
		null,
		'texte',
		{},
		{ slug: '' },
		{ slug: 12 },
		{ slug: 'a'.repeat(201) },
		{ slug: 'a', extra: 'x' },
	])('anything else is refused: %j', body => {
		expect(readViewBody(body)).toBeUndefined()
	})
})

describe('automated agents', () => {
	test.each([
		'Googlebot/2.1',
		'Mozilla/5.0 (compatible; bingbot/2.0)',
		'curl/8.4.0',
		'HeadlessChrome/120',
		'python-requests/2.31',
	])('%s is not counted', agent => {
		expect(isAutomatedAgent(agent)).toBe(true)
	})

	test('a browser is counted', () => {
		expect(
			isAutomatedAgent(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
			)
		).toBe(false)
	})

	test('no agent at all is not counted', () => {
		expect(isAutomatedAgent(null)).toBe(true)
		expect(isAutomatedAgent('')).toBe(true)
	})
})

describe('retention', () => {
	test('92 days back, counted on the day of Paris', () => {
		expect(viewsPurgeDay(new Date('2026-10-23T10:00:00.000Z'))).toBe('2026-07-23')
	})

	test('just after midnight in Paris, the day is already the next one', () => {
		expect(viewsPurgeDay(new Date('2026-10-23T22:30:00.000Z'))).toBe('2026-07-24')
	})
})

describe('the 30 days of the dashboard', () => {
	const now = new Date('2026-10-23T10:00:00.000Z')

	test('30 days, oldest first, the days without a view at zero', () => {
		const days = lastViewDays(
			[
				{ day: '2026-10-23', count: 4 },
				{ day: '2026-10-01', count: 2 },
				{ day: '2026-09-23', count: 9 },
			],
			now
		)
		expect(days).toHaveLength(30)
		expect(days[0]).toEqual({ day: '2026-09-24', count: 0 })
		expect(days[29]).toEqual({ day: '2026-10-23', count: 4 })
		expect(days.find(entry => entry.day === '2026-10-01')?.count).toBe(2)
		expect(days.some(entry => entry.day === '2026-09-23')).toBe(false)
	})

	/** The days of the calendar from `first` to `last`, both included. */
	const calendar = (first: string, last: string): string[] => {
		const days: string[] = []
		for (
			let day = new Date(`${first}T12:00:00Z`);
			day <= new Date(`${last}T12:00:00Z`);
			day.setUTCDate(day.getUTCDate() + 1)
		)
			days.push(day.toISOString().slice(0, 10))
		return days
	}

	// A step of 24 hours back from the instant crosses a change of hour: at 23:27 in Paris on 26/10/2026 (winter time),
	// the instant two days earlier is 00:27 on 25/10 in summer time. The day of 25/10 came twice, its views counted
	// twice, and 24/10 was gone (red on the CI at 22:27 UTC, 26/10/2026). The days are days of the calendar.
	test.each([
		[
			'the last hour of the day, the day after the change to winter time',
			'2026-10-26T22:27:00.000Z',
			'2026-09-27',
			'2026-10-26',
		],
		['the last hour of the day, a month after it', '2026-11-20T22:59:00.000Z', '2026-10-22', '2026-11-20'],
		[
			'the first hour of the day, after the change to summer time',
			'2027-03-28T22:30:00.000Z',
			'2027-02-28',
			'2027-03-29',
		],
		['the first hour of the day, in summer time', '2027-04-10T22:10:00.000Z', '2027-03-13', '2027-04-11'],
	])('30 distinct days in a row, whatever the hour: %s', (_case, instant, first, last) => {
		const days = lastViewDays([], new Date(instant)).map(entry => entry.day)
		expect(days).toEqual(calendar(first, last))
	})
})

describe('a day of Paris, some days of the calendar before', () => {
	test.each([
		['2026-10-26T22:27:00.000Z', 2, '2026-10-24'],
		['2026-10-26T22:27:00.000Z', 92, '2026-07-26'],
		['2027-03-28T22:30:00.000Z', 1, '2027-03-28'],
		['2026-10-23T10:00:00.000Z', 0, '2026-10-23'],
	])('%s, %i days before: %s', (instant, back, expected) => {
		expect(parisDayBefore(new Date(instant), back)).toBe(expected)
	})
})

describe('the browser side', () => {
	function browser(over: { webdriver?: boolean; refused?: boolean } = {}) {
		const store = new Map<string, string>()
		const sent: unknown[] = []
		return {
			sent,
			store,
			report: (slug: string) =>
				reportProfileView({
					slug,
					storage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) },
					send: body => void sent.push(body),
					automated: over.webdriver === true,
					refused: over.refused === true,
				}),
		}
	}

	test('the same tab counts a profile once, however many times it reloads', () => {
		const tab = browser()
		expect(tab.report('marie-fictive')).toBe(true)
		expect(tab.report('marie-fictive')).toBe(false)
		expect(tab.sent).toEqual([{ slug: 'marie-fictive' }])
	})

	test('a second tab has its own storage and counts again', () => {
		const first = browser()
		const second = browser()
		first.report('marie-fictive')
		second.report('marie-fictive')
		expect(first.sent.length + second.sent.length).toBe(2)
	})

	test('another profile in the same tab counts', () => {
		const tab = browser()
		tab.report('marie-fictive')
		tab.report('lea-fictive')
		expect(tab.sent).toHaveLength(2)
	})

	test('an automated browser and a visitor who refused the measure send nothing', () => {
		expect(browser({ webdriver: true }).report('marie-fictive')).toBe(false)
		expect(browser({ refused: true }).report('marie-fictive')).toBe(false)
	})

	test('a storage that throws still counts, and does not break the page', () => {
		const sent: unknown[] = []
		const result = reportProfileView({
			slug: 'marie-fictive',
			storage: {
				getItem: () => {
					throw new Error('blocked')
				},
				setItem: () => {
					throw new Error('blocked')
				},
			},
			send: body => void sent.push(body),
			automated: false,
			refused: false,
		})
		expect(result).toBe(true)
		expect(sent).toHaveLength(1)
	})
})

describe('the weekly statistics', () => {
	const period = { debut: new Date('2026-10-12T22:00:00.000Z'), fin: new Date('2026-10-19T22:00:00.000Z') }

	test('the total and the days of the period, all profiles together', () => {
		const views = aggregateViews(
			[
				{ day: '2026-10-12', count: 3 }, // before the first day of Paris
				{ day: '2026-10-13', count: 5 },
				{ day: '2026-10-13', count: 2 },
				{ day: '2026-10-19', count: 7 },
				{ day: '2026-10-20', count: 100 },
				{ day: '2026-10-11', count: 100 },
			],
			period
		)
		expect(views).toEqual({ total: 14, byDay: { '2026-10-13': 7, '2026-10-19': 7 } })
	})

	test('the answer without `views` is still valid: the reader says « inconnu »', () => {
		expect(WeeklyStats.shape.views.isOptional()).toBe(true)
	})
})

describe('the daily purge', () => {
	const now = new Date('2026-10-23T10:00:00.000Z')

	test('it deletes the rows older than 92 days and the rows of no profile, and gives the number', async () => {
		const calls: unknown[] = []
		const payload = {
			delete: (args: unknown) => {
				calls.push(args)
				return Promise.resolve({ docs: [{ id: 1 }], errors: [] })
			},
			logger: { info: () => undefined, error: () => undefined },
		} as unknown as Payload
		expect(await purgeProfileViews.executer(payload, now)).toBe(1)
		expect(calls[0]).toMatchObject({
			collection: 'profile-views',
			where: { or: [{ day: { less_than: '2026-07-23' } }, { profile: { exists: false } }] },
		})
	})

	test('it is one of the daily tasks', async () => {
		const names: string[] = []
		const payload = {
			delete: () => Promise.resolve({ docs: [], errors: [] }),
			find: () => Promise.resolve({ docs: [], totalDocs: 0 }),
			count: () => Promise.resolve({ totalDocs: 0 }),
			update: () => Promise.resolve({ docs: [] }),
			logger: { info: (line: { msg: string }) => names.push(line.msg), error: () => undefined },
		} as unknown as Payload
		await runDailyTasks(payload, now)
		expect(names.some(line => line.includes('purge-profile-views'))).toBe(true)
	})
})
