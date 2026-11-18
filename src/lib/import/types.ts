export type ImportProblem = {
	level: 'error' | 'warning';
	file: string;
	row: number | null;
	field: string | null;
	message: string;
};
export type LogoVariant = 'normal' | 'white' | 'black';
export type ImportTeamRow = {
	row: number;
	name: string;
	tag: string;
	logos: Record<LogoVariant, string | null>; // zip entry paths
};
export type ImportPlayerRow = {
	row: number;
	displayName: string;
	fullName: string | null;
	riotId: string | null;
	portrait: string | null;
};
export type ImportPreview = {
	hash: string;
	teams: ImportTeamRow[];
	players: ImportPlayerRow[];
	imageCount: number;
	problems: ImportProblem[];
};
export type ImportResult = {
	importPreview?: ImportPreview;
	imported?: { teams: number; players: number };
	importError?: string;
};
