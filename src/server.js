import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/database.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await connectDatabase();

    const server = app.listen(port, host);
    server.on('listening', () => {
      console.log(`server running on http://${host}:${port}`);
    });
    server.on('error', (err) => {
      console.error(err.code === 'EADDRINUSE' ? `port ${port} in use` : err.message);
      process.exit(1);
    });
  } catch (err) {
    console.error('start failed:', err.message);
    process.exit(1);
  }
}

start();
