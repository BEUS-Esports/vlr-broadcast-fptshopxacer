/** Management POST attempts may commit before failing; the publisher deduplicates saved revisions. */
export function isBroadcastMutation(request: Request, routeId: string | null): boolean {
	return (
		request.method === 'POST' &&
		routeId !== null &&
		routeId !== '/admin/resources/sync' &&
		/^\/admin\/(teams|players|resources|tournaments|matches|games|graphics)(?:\/|$)/.test(routeId)
	);
}
