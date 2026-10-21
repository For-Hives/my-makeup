/**
 * `with-secret cloudflare -- bun run media:backup [options]`: the daily copy of the photos and the
 * rule of the bin (ticket 278; docs/migration/COPIE-PHOTOS.md).
 *
 * Without `--apply` nothing is written: the copy only plans, the rule is only shown.
 *
 *   (no option)                 the plan of the copy: counts, no write
 *   --apply                     the pass: copy, check, write the dated manifest
 *   --lifecycle                 show the rule of the bin and the rules the bucket holds
 *   --lifecycle --apply         set the rule (the whole list is sent: the rules read, plus ours), read it back
 *   --age                       the age of the last pass; exit code 1 beyond 48 hours or with no pass
 *   --restore-check <key> --into <scratch bucket>
 *                               restores one object of the copy into a scratch bucket, compares the MD5
 *
 * Nothing is ever removed: the tool has no call that does. Output: counts, dates, fingerprints; no key.
 * Exit code: 0 all well, 1 gaps or errors (or late copy), 2 bad use.
 */

import { copyFreshness, restoreCheck, runCopy } from './backup/copy'
import { onlyTrashRuleDiffers, planLifecycle, trashRuleIsSet } from './backup/lifecycle'
import { R2Client, R2Error } from './backup/r2'

export const SOURCE_BUCKET = 'my-makeup'
export const BACKUP_BUCKET = 'my-makeup-media-backup'

const args = process.argv.slice(2)
const flag = (name: string): boolean => args.includes(name)
const optionValue = (name: string): string | undefined => {
	const index = args.indexOf(name)
	return index === -1 ? undefined : args[index + 1]
}

if (flag('--help') || flag('-h')) {
	console.log('Voir l’en-tête de scripts/media/backup.ts et docs/migration/COPIE-PHOTOS.md.')
	process.exit(0)
}

try {
	const client = await R2Client.fromEnv({ sourceBucket: SOURCE_BUCKET, backupBucket: BACKUP_BUCKET })
	const apply = flag('--apply')

	if (flag('--age')) {
		const freshness = await copyFreshness(client)
		console.log(JSON.stringify(freshness))
		process.exit(freshness.stale ? 1 : 0)
	}

	if (flag('--restore-check')) {
		const key = optionValue('--restore-check')
		const scratch = optionValue('--into')
		if (!key || !scratch) {
			console.error('Usage : --restore-check <clé> --into <compartiment jetable>')
			process.exit(2)
		}
		const result = await restoreCheck(client, key, scratch)
		console.log(JSON.stringify(result))
		process.exit(result.identical ? 0 : 1)
	}

	if (flag('--lifecycle')) {
		const before = await client.getLifecycle()
		const plan = planLifecycle(before)
		console.log(
			JSON.stringify({
				action: plan.action,
				rulesRead: before.map(rule => rule.id),
				otherDeletingRules: plan.otherDeletingRules,
				dangerousRules: plan.dangerousRules,
			})
		)
		if (plan.dangerousRules.length > 0) {
			console.error('Une autre règle supprime hors de deleted/ : rien n’est posé.')
			process.exit(1)
		}
		if (apply && plan.action !== 'none') {
			await client.putLifecycle(plan.rules)
			const after = await client.getLifecycle()
			const ok = trashRuleIsSet(after) && onlyTrashRuleDiffers(before, after)
			console.log(JSON.stringify({ readBack: after, ok }))
			process.exit(ok ? 0 : 1)
		}
		process.exit(0)
	}

	const manifest = await runCopy(client, { apply, log: line => console.log(line) })
	console.log(JSON.stringify(manifest, null, 2))
	process.exit(apply && (manifest.gaps > 0 || manifest.errors > 0) ? 1 : 0)
} catch (error) {
	console.error(error instanceof R2Error ? error.message : 'Échec de la copie des photos.')
	process.exit(1)
}
