import { requireSapSession } from '../middleware/sapAuth.js';
import {
  getPoLineStats,
  getPurchaseOrderHeader,
  getPurchaseOrderLines,
  getUserPurchaseOrders,
  getWarehouseNameMap
} from '../services/purchaseOrdersService.js';
import { createGoodsReceiptPo, fetchPurchaseOrderFromSap } from '../services/sapPoService.js';

function statusOf(v) {
  if (v === 'O' || v === 'bost_Open') return 'O';
  if (v === 'C' || v === 'bost_Close') return 'C';
  return v || '';
}

function mapLine(r) {
  const code = r.WhsCode || r.WarehouseCode || '';
  const name = r.WhsName || r.WarehouseName || '';
  const open = Number(r.OpenQty ?? r.RemainingOpenQuantity ?? r.Quantity ?? 0);
  return {
    lineNum: Number(r.LineNum || 0),
    itemCode: r.ItemCode || '',
    itemDescription: r.Dscription || r.ItemDescription || '',
    quantity: open,
    orderedQuantity: Number(r.Quantity || 0),
    openQuantity: open,
    warehouseCode: code,
    warehouseName: name
  };
}

async function fillWhsNames(lines) {
  const missing = lines.filter((l) => l.warehouseCode && !l.warehouseName).map((l) => l.warehouseCode);
  if (!missing.length) return lines;
  const names = await getWarehouseNameMap(missing);
  for (const l of lines) {
    if (l.warehouseCode && !l.warehouseName) l.warehouseName = names.get(l.warehouseCode) || '';
  }
  return lines;
}

async function loadPo(session, docEntry) {
  try {
    const sap = await fetchPurchaseOrderFromSap(session, docEntry);
    if (sap) {
      const lines = await fillWhsNames((sap.DocumentLines || []).map(mapLine));
      return {
        docEntry: Number(sap.DocEntry),
        docNum: String(sap.DocNum || ''),
        cardCode: sap.CardCode || '',
        cardName: sap.CardName || '',
        docDate: sap.DocDate || null,
        documentStatus: statusOf(sap.DocumentStatus),
        cancelStatus: sap.CancelStatus || '',
        lines,
        openLineCount: lines.filter((x) => x.openQuantity > 0).length,
        totalQty: lines.reduce((n, x) => n + Number(x.openQuantity || 0), 0)
      };
    }
  } catch (_) {}

  const h = await getPurchaseOrderHeader(docEntry);
  if (!h) return null;

  const map = await getPurchaseOrderLines([docEntry]);
  const lines = await fillWhsNames((map.get(Number(docEntry)) || []).map(mapLine));

  return {
    docEntry: Number(h.DocEntry),
    docNum: String(h.DocNum || ''),
    cardCode: h.CardCode || '',
    cardName: h.CardName || '',
    docDate: h.DocDate || null,
    documentStatus: statusOf(h.DocStatus),
    cancelStatus: h.CANCELED === 'Y' ? 'csYes' : 'csNo',
    lines,
    openLineCount: lines.filter((x) => x.openQuantity > 0).length,
    totalQty: lines.reduce((n, x) => n + Number(x.openQuantity || 0), 0)
  };
}

export function registerPurchaseOrderRoutes(app) {
  app.get('/api/receive/purchase-orders', requireSapSession, async (req, res) => {
    try {
      const username = String(req.query.username || req.headers['x-username'] || '').trim();
      if (!username) {
        return res.status(400).json({ success: false, message: 'ต้องระบุ username' });
      }

      const status = String(req.query.status || 'open').toLowerCase();
      let rows = await getUserPurchaseOrders(
        username,
        status !== 'all' && status !== 'closed' && status !== 'c'
      );
      if (status === 'closed' || status === 'c') {
        rows = rows.filter((r) => r.DocStatus === 'C');
      }

      const stats = await getPoLineStats(rows.map((r) => r.DocEntry));
      const data = rows.map((r) => {
        const docEntry = Number(r.DocEntry);
        const s = stats.get(docEntry) || { openLineCount: 0, totalQty: 0 };
        return {
          docEntry,
          docNum: String(r.DocNum || ''),
          cardCode: r.CardCode || '',
          cardName: r.CardName || '',
          docDate: r.DocDate || null,
          documentStatus: statusOf(r.DocStatus),
          openLineCount: s.openLineCount,
          totalQty: s.totalQty,
          lines: []
        };
      });

      res.json({ success: true, count: data.length, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message || 'ดึง PO ไม่สำเร็จ' });
    }
  });

  app.get('/api/receive/purchase-orders/:docEntry', requireSapSession, async (req, res) => {
    try {
      const docEntry = Number(req.params.docEntry);
      if (!docEntry) {
        return res.status(400).json({ success: false, message: 'docEntry ไม่ถูกต้อง' });
      }

      const data = await loadPo(req.sapSession, docEntry);
      if (!data) {
        return res.status(404).json({ success: false, message: 'ไม่พบ Purchase Order' });
      }
      res.json({ success: true, data });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'ดึงรายละเอียด PO ไม่สำเร็จ'
      });
    }
  });

  app.post('/api/receive/purchase-orders/:docEntry/receipt', requireSapSession, async (req, res) => {
    try {
      const docEntry = Number(req.params.docEntry);
      if (!docEntry) {
        return res.status(400).json({ success: false, message: 'docEntry ไม่ถูกต้อง' });
      }

      const po = await loadPo(req.sapSession, docEntry);
      if (!po) {
        return res.status(404).json({ success: false, message: 'ไม่พบ Purchase Order' });
      }
      if (po.documentStatus === 'C') {
        return res.status(400).json({ success: false, message: 'ใบนี้ปิดแล้ว รับสินค้าไม่ได้' });
      }

      const result = await createGoodsReceiptPo(req.sapSession, po, req.body || {});
      res.json({ success: true, docEntry: result.docEntry, docNum: result.docNum });
    } catch (err) {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'บันทึกการรับสินค้าไม่สำเร็จ'
      });
    }
  });
}

export default { registerPurchaseOrderRoutes };
