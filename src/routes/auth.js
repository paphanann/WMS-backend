import { Router } from 'express';

import { isSapEnabled, login } from '../services/authService.js';
import { logoutFromSap } from '../services/sapAuthService.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const username = req.body?.username?.trim();
    const password = req.body?.password;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ username และ password'
      });
    }

    const result = await login({ username, password });

    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      ...result
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'เข้าสู่ระบบไม่สำเร็จ'
    });
  }
});

router.post('/logout', async (req, res) => {
  try {
    if (isSapEnabled()) {
      const sessionId =
        req.headers.b1session ||
        req.body?.sessionId ||
        req.body?.session?.sessionId;

      const routeId =
        req.headers.routeid ||
        req.body?.routeId ||
        req.body?.session?.routeId;

      if (sessionId && !String(sessionId).startsWith('wms-')) {
        try {
          await logoutFromSap({ sessionId, routeId });
        } catch (sapError) {
          console.warn('SAP logout ไม่สำเร็จ:', sapError.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'ออกจากระบบสำเร็จ',
      sapEnabled: isSapEnabled()
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'ออกจากระบบไม่สำเร็จ'
    });
  }
});

export default router;
