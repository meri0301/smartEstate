import { createApp } from './app.factory.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { loadRootEnv } from './config/load-env.js';

/** Binding to all interfaces is required for the process to be reachable inside Docker. */
const LISTEN_HOST = '0.0.0.0';

loadRootEnv();
const app = await createApp();
const config = app.get<AppConfig>(APP_CONFIG);
await app.listen(config.port, LISTEN_HOST);
