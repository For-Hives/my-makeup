import * as migration_20261019_151825_init from './20261019_151825_init'
import * as migration_20261020_215218_zone_countries_postal_codes from './20261020_215218_zone_countries_postal_codes'
import * as migration_20261021_120000_media_object_missing from './20261021_120000_media_object_missing'
import * as migration_20261022_054854_contact_phone_optional from './20261022_054854_contact_phone_optional'
import * as migration_20261022_090403_auth_events_link_methods from './20261022_090403_auth_events_link_methods'
import * as migration_20261023_031452_specialty_bullets from './20261023_031452_specialty_bullets'
import * as migration_20261023_031614_search_counts from './20261023_031614_search_counts'
import * as migration_20261023_031822_profile_views from './20261023_031822_profile_views'
import * as migration_20261023_110850_reminders from './20261023_110850_reminders'
import * as migration_20261023_113139_quote_requests from './20261023_113139_quote_requests'

export const migrations = [
	{
		up: migration_20261019_151825_init.up,
		down: migration_20261019_151825_init.down,
		name: '20261019_151825_init',
	},
	{
		up: migration_20261020_215218_zone_countries_postal_codes.up,
		down: migration_20261020_215218_zone_countries_postal_codes.down,
		name: '20261020_215218_zone_countries_postal_codes',
	},
	{
		up: migration_20261021_120000_media_object_missing.up,
		down: migration_20261021_120000_media_object_missing.down,
		name: '20261021_120000_media_object_missing',
	},
	{
		up: migration_20261022_054854_contact_phone_optional.up,
		down: migration_20261022_054854_contact_phone_optional.down,
		name: '20261022_054854_contact_phone_optional',
	},
	{
		up: migration_20261022_090403_auth_events_link_methods.up,
		down: migration_20261022_090403_auth_events_link_methods.down,
		name: '20261022_090403_auth_events_link_methods',
	},
	{
		up: migration_20261023_031452_specialty_bullets.up,
		down: migration_20261023_031452_specialty_bullets.down,
		name: '20261023_031452_specialty_bullets',
	},
	{
		up: migration_20261023_031614_search_counts.up,
		down: migration_20261023_031614_search_counts.down,
		name: '20261023_031614_search_counts',
	},
	{
		up: migration_20261023_031822_profile_views.up,
		down: migration_20261023_031822_profile_views.down,
		name: '20261023_031822_profile_views',
	},
	{
		up: migration_20261023_110850_reminders.up,
		down: migration_20261023_110850_reminders.down,
		name: '20261023_110850_reminders',
	},
	{
		up: migration_20261023_113139_quote_requests.up,
		down: migration_20261023_113139_quote_requests.down,
		name: '20261023_113139_quote_requests',
	},
]
