<script lang="ts">
	import { fitGroup } from './fit';
	let { long, team = 'Robo Trái Cây' }: { long: string; team?: string } = $props();
</script>

<div {@attach fitGroup('players')} {@attach fitGroup('teams')}>
	<span data-fit="players" class="player">AB</span>
	<span data-fit="players" class="player">{long}</span>
	<span data-fit="teams" class="team">{team}</span>
</div>

<style>
	span {
		display: block;
		width: 200px;
		white-space: nowrap;
		overflow: hidden;
		font-family: sans-serif;
	}
	.player {
		font-size: calc(20px * var(--fit-players, 1));
	}
	.team {
		font-size: calc(20px * var(--fit-teams, 1));
	}
</style>
