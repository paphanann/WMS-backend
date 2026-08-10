import 'dotenv/config';

import app from './app.js';
import { connectDatabase } from './config/database.js';

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    await connectDatabase();

    app.listen(port, host, () => {
     // console.log(`WMS Backend running at http://localhost:${port}`);
     console.log(`WMS Backend running at http://${host}:${port}`);
    });
  } catch (error) {
    console.error('ไม่สามารถเปิด WMS Backend ได้');
    process.exit(1);
  }
}

startServer();