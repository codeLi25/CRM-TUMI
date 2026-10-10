import { PrismaClient } from '@prisma/client';
import { readConfig } from './config.js';
import { createApp } from './app.js';
import { createMailer } from './mail.js';
const config = readConfig();
const db = new PrismaClient();
await db.$connect();
const app = await createApp(db, config, createMailer(config));
const server = app.listen(config.PORT, '127.0.0.1', () => console.log(`API El Tumi: http://127.0.0.1:${config.PORT}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { void db.$disconnect().then(() => process.exit(0)); });
});
