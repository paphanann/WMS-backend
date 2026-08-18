import { Router } from 'express';
import { requireSapSession } from '../middleware/sapAuth.js';
import { fetchWarehouses } from '../services/warehousesService.js';

const router = Router();

router.get('/', requireSapSession, async (req, res) => {
  try {
    const data = await fetchWarehouses(req.sapSession);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'ดึงคลังสินค้าไม่สำเร็จ'
    });
  }
});

export default router;
