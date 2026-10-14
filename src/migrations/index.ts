import * as migration_20261014_010035_socle_provisoire from './20261014_010035_socle_provisoire'
import * as migration_20261014_050526_admins_roles_provisoire from './20261014_050526_admins_roles_provisoire'
import * as migration_20261014_051533_pros_comptes_provisoire from './20261014_051533_pros_comptes_provisoire'
import * as migration_20261014_052503_profils_proprietaire_provisoire from './20261014_052503_profils_proprietaire_provisoire'
import * as migration_20261014_061436_talents_provisoire from './20261014_061436_talents_provisoire'
import * as migration_20261014_061848_profils_listes_provisoire from './20261014_061848_profils_listes_provisoire'
import * as migration_20261014_062220_profils_champs_reserves_provisoire from './20261014_062220_profils_champs_reserves_provisoire'
import * as migration_20261014_062549_profils_contact_provisoire from './20261014_062549_profils_contact_provisoire'
import * as migration_20261014_063859_media_lecture_provisoire from './20261014_063859_media_lecture_provisoire'
import * as migration_20261014_074656_profils_zone_provisoire from './20261014_074656_profils_zone_provisoire'
import * as migration_20261014_083134_profils_etat_provisoire from './20261014_083134_profils_etat_provisoire'

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
	{
		up: migration_20261014_052503_profils_proprietaire_provisoire.up,
		down: migration_20261014_052503_profils_proprietaire_provisoire.down,
		name: '20261014_052503_profils_proprietaire_provisoire',
	},
	{
		up: migration_20261014_061436_talents_provisoire.up,
		down: migration_20261014_061436_talents_provisoire.down,
		name: '20261014_061436_talents_provisoire',
	},
	{
		up: migration_20261014_061848_profils_listes_provisoire.up,
		down: migration_20261014_061848_profils_listes_provisoire.down,
		name: '20261014_061848_profils_listes_provisoire',
	},
	{
		up: migration_20261014_062220_profils_champs_reserves_provisoire.up,
		down: migration_20261014_062220_profils_champs_reserves_provisoire.down,
		name: '20261014_062220_profils_champs_reserves_provisoire',
	},
	{
		up: migration_20261014_062549_profils_contact_provisoire.up,
		down: migration_20261014_062549_profils_contact_provisoire.down,
		name: '20261014_062549_profils_contact_provisoire',
	},
	{
		up: migration_20261014_063859_media_lecture_provisoire.up,
		down: migration_20261014_063859_media_lecture_provisoire.down,
		name: '20261014_063859_media_lecture_provisoire',
	},
	{
		up: migration_20261014_074656_profils_zone_provisoire.up,
		down: migration_20261014_074656_profils_zone_provisoire.down,
		name: '20261014_074656_profils_zone_provisoire',
	},
	{
		up: migration_20261014_083134_profils_etat_provisoire.up,
		down: migration_20261014_083134_profils_etat_provisoire.down,
		name: '20261014_083134_profils_etat_provisoire',
	},
]
