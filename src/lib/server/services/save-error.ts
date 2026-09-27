export class SaveError extends Error {
	constructor(
		public readonly code: 'invalid' | 'not-found' | 'stale' | 'blocked',
		message: string
	) {
		super(message);
		this.name = 'SaveError';
	}
}
