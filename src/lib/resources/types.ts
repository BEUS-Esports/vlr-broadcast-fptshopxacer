export type AgentAbilitySlot = 'grenade' | 'ability1' | 'ability2' | 'ultimate';
export type AgentAbility = {
	slot: AgentAbilitySlot;
	displayName: string;
	displayIconPath: string | null;
};
