import * as migration_20261014_010035_socle_provisoire from './20261014_010035_socle_provisoire'
import * as migration_20261014_050526_admins_roles_provisoire from './20261014_050526_admins_roles_provisoire'
import * as migration_20261014_051533_pros_comptes_provisoire from './20261014_051533_pros_comptes_provisoire'

export const migrations = [
	{
		up: migration_20261014_010035_socle_provisoire.up,
		down: migration_20261014_010035_socle_provisoire.down,
		name: '20261014_010035_socle_provisoire',
	},
	{
		up: migration_20261014_050526_admins_roles_provisoire.up,
		down: migration_20261014_050526_admins_roles_provisoire.down,
		name: '20261014_050526_admins_roles_provisoire',
	},
	{
		up: migration_20261014_051533_pros_comptes_provisoire.up,
		down: migration_20261014_051533_pros_comptes_provisoire.down,
		name: '20261014_051533_pros_comptes_provisoire',
	},
]
