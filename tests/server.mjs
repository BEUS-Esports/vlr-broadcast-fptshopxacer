import { once } from 'node:events';

// Cold app process: fixture imports must not mask native runtime dependency failures.
process.env.PORT = '4173';
const { server } = await import('../build/index.js');
await once(server, 'listening');
process.send('ready');
process.on('message', (message) => {
	if (message === 'stop') {
		server.closeAllConnections();
		server.close(() => process.exit(0));
	}
});
