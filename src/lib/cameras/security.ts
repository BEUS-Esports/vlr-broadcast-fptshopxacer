/**
 * VDO.Ninja only works in a secure context (HTTPS or localhost), and an embedded iframe is
 * secure only when its parent page is. `local-only` works on the server PC, but other LAN
 * machines (OBS/vMix loading HUD outputs) reach it over plain HTTP and lose every camera.
 */
export type PageSecurity = 'https' | 'local-only' | 'insecure';

export function pageSecurity(protocol: string, isSecureContext: boolean): PageSecurity {
	if (!isSecureContext) return 'insecure';
	return protocol === 'https:' ? 'https' : 'local-only';
}
