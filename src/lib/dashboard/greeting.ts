import { text } from '@/lib/profile/display-name'

/**
 * The name the space greets the makeup artist with: the first name of her profile, else the first
 * word of the display name of her account (a full name is cut: only a first name is expected here),
 * else « toi ».
 */
export function greetingName(names: { firstName?: unknown; accountName?: unknown }): string {
	return text(names.firstName) || text(names.accountName).split(/\s+/)[0] || 'toi'
}
