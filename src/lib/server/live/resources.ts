import { db } from '#lib/server/db/index.ts';
import { agents, weapons } from '#lib/server/db/schema/index.ts';
import type { LiveResources } from '#lib/live/selectors.ts';

/** Static local artwork is separate from both provider telemetry and held program captures. */
export async function loadLiveResources(): Promise<LiveResources> {
	const [agentRows, weaponRows] = await Promise.all([
		db
			.select({
				id: agents.id,
				key: agents.key,
				displayName: agents.displayName,
				roleName: agents.roleName,
				displayIconPath: agents.displayIconPath,
				fullPortraitPath: agents.fullPortraitPath,
				bustPortraitPath: agents.bustPortraitPath,
				roleIconPath: agents.roleIconPath,
				abilities: agents.abilities
			})
			.from(agents),
		db
			.select({
				key: weapons.key,
				displayName: weapons.displayName,
				displayIconPath: weapons.displayIconPath
			})
			.from(weapons)
	]);
	return { agents: agentRows, weapons: weaponRows };
}
