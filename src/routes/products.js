import { Router } from 'express';
import { requireSapSession } from '../middleware/sapAuth.js';
import { searchProducts } from '../services/productsService.js';

const router = Router();

router.get('/', requireSapSession, async (req, res) => {
  try {
    const data = await searchProducts(req.sapSession, {
      q: req.query.q,
      inventoryItem: req.query.inventoryItem,
      top: req.query.top
    });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'ค้นหาสินค้าไม่สำเร็จ'
    });
  }
});

export default router;
