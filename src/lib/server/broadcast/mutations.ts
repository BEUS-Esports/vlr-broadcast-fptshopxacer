/** Only completed management actions publish. Their database writes already own atomic revisions. */
export async function successfulBroadcastMutation(
	request: Request,
	routeId: string | null,
	response: Response
): Promise<boolean> {
	if (request.method !== 'POST' || !routeId || response.status < 200 || response.status >= 400)
		return false;
	if (routeId === '/admin/resources/sync') return false;
	if (routeId === '/admin/resources' && new URL(request.url).searchParams.has('/refresh'))
		return false;
	if (
		!/^\/admin\/(teams|players|resources|tournaments|matches|games|graphics)(?:\/|$)/.test(routeId)
	)
		return false;
	if (response.headers.get('content-type')?.includes('application/json')) {
		try {
			const result: unknown = await response.clone().json();
			if (
				!result ||
				typeof result !== 'object' ||
				!('type' in result) ||
				!['success', 'redirect'].includes(String(result.type))
			)
				return false;
		} catch {
			return false;
		}
	}
	return true;
}
