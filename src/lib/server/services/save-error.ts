export class SaveError extends Error {
	constructor(
		public readonly code: 'invalid' | 'not-found' | 'stale' | 'blocked',
		message: string
	) {
		super(message);
		this.name = 'SaveError';
	}
}

export function hasDatabaseError(cause: unknown, text: string) {
	while (cause instanceof Error) {
		if (cause.message.includes(text)) return true;
		cause = cause.cause;
	}
	return false;
}
