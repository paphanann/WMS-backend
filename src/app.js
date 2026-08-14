import express from 'express';
import cors from 'cors';
import { checkDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import { registerPurchaseOrderRoutes } from './routes/purchase_orders_route.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ success: true, message: 'WMS Backend is running' });
});

app.get('/api/health', async (req, res) => {
  try {
    const database = await checkDatabase();
    res.json({
      success: true,
      message: 'ok',
      serverTime: new Date().toISOString(),
      database
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'db error',
      error: err.message
    });
  }
});

app.use('/api/auth', authRoutes);
registerPurchaseOrderRoutes(app);

export default app;
