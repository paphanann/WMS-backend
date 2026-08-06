import express from 'express';
import cors from 'cors';

import { checkDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'WMS Backend is running'
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const database = await checkDatabase();

    res.status(200).json({
      success: true,
      message: 'เชื่อมต่อ WMS Server และ SQL Server สำเร็จ',
      serverTime: new Date().toISOString(),
      database
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'เชื่อมต่อ SQL Server ไม่สำเร็จ',
      error: error.message
    });
  }
});

app.use('/api/auth', authRoutes);

export default app;