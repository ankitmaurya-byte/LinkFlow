import { createApp } from './app.js';
import { connectDb } from './db.js';
import { config, validateConfig } from './config.js';

async function main() {
  validateConfig();
  await connectDb(config.mongoUrl);
  const app = createApp();
  app.listen(config.port, () => {
    console.log(JSON.stringify({ msg: 'listening', port: config.port }));
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
