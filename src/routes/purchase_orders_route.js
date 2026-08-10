import https from 'https';
import sql from 'mssql';

import { sapConfig } from '../config/sap.js';
import { getSapDatabasePool } from '../config/database.js';

const B1_BASE_URL =
  process.env.B1_SERVICE_LAYER_URL ||
  process.env.SAP_BASE_URL ||
  sapConfig.baseUrl ||
  'https://127.0.0.1:50000/b1s/v1';

const B1_AGENT = new https.Agent({ rejectUnauthorized: false });

const CROSS_JOIN_PATH =
  '/$crossjoin(PurchaseOrders,PurchaseOrders/DocumentLines)';

const EXPAND =
  'PurchaseOrders($select=DocEntry,DocNum,CardCode,CardName,DocDate,DocumentStatus,CancelStatus),' +
  'PurchaseOrders/DocumentLines($select=LineNum,ItemCode,ItemDescription,Quantity,WarehouseCode)';

const FILTER =
  'PurchaseOrders/DocEntry eq PurchaseOrders/DocumentLines/DocEntry';

async function fetchSapCrossJoin({ sessionId, routeId }) {
  const b1Url =
    `${B1_BASE_URL}${CROSS_JOIN_PATH}` +
    `?$expand=${encodeURIComponent(EXPAND)}` +
    `&$filter=${encodeURIComponent(FILTER)}`;

  const response = await fetch(b1Url, {
    headers: {
      Cookie: `B1SESSION=${sessionId}; ROUTEID=${routeId || ''}`,
      'Content-Type': 'application/json'
    },
    // Node.js undici ใช้ dispatcher / agent ผ่าน undici ไม่ตรงกับ node-fetch
    // จึงใช้ https agent ผ่าน custom fetch แบบนี้ไม่ได้เสมอ — fallback ด้านล่างใช้ axios-like path
    agent: B1_AGENT
  });

  const payload = await response.json();
  return { response, payload };
}

async function fetchSapCrossJoinSafe({ sessionId, routeId }) {
  try {
    return await fetchSapCrossJoin({ sessionId, routeId });
  } catch {
    // fallback: ใช้ axios client เดิมของโปรเจกต์
    const { createSapClient } = await import('../services/sapAuthService.js');
    const client = createSapClient({ sessionId, routeId });
    const path =
      `${CROSS_JOIN_PATH}` +
      `?$expand=${encodeURIComponent(EXPAND)}` +
      `&$filter=${encodeURIComponent(FILTER)}`;

    const sapRes = await client.get(path);
    return {
      response: { ok: sapRes.status >= 200 && sapRes.status < 300, status: sapRes.status },
      payload: sapRes.data
    };
  }
}

export function registerPurchaseOrderRoutes(app, sqlPool) {
  app.get('/api/receive/purchase-orders', async (req, res) => {
    try {
      const sessionId = req.headers['x-session-id'] || req.headers.b1session;
      const routeId = req.headers['x-route-id'] || req.headers.routeid;
      const username = (req.query.username || req.headers['x-username'] || '')
        .toString()
        .trim();

      if (!sessionId) {
        return res.status(401).json({
          success: false,
          message: 'กรุณาเข้าสู่ระบบก่อน'
        });
      }

      const { response: b1Res, payload } = await fetchSapCrossJoinSafe({
        sessionId,
        routeId
      });

      if (!b1Res.ok) {
        return res.status(b1Res.status || 400).json({
          success: false,
          message:
            payload?.error?.message?.value || 'ดึง PO จาก SAP ไม่สำเร็จ'
        });
      }

      let rows = payload.value || [];

      const pool = sqlPool || getSapDatabasePool();

      if (username && pool) {
        const result = await pool
          .request()
          .input('username', sql.NVarChar, username)
          .query(`
            SELECT T0.DocEntry
            FROM OPOR T0
            INNER JOIN OUSR T1 ON T0.UserSign = T1.USERID
            WHERE T1.USER_CODE = @username
          `);

        const allowed = new Set(result.recordset.map((row) => row.DocEntry));
        rows = rows.filter((row) => {
          const docEntry = row?.PurchaseOrders?.DocEntry;
          return allowed.has(docEntry);
        });
      }

      return res.json({ success: true, value: rows });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'ดึงข้อมูล Purchase Order ไม่สำเร็จ'
      });
    }
  });
}

export default { registerPurchaseOrderRoutes };
