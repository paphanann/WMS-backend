import { requireSapSession } from '../middleware/sapAuth.js';
import {
  getOpenLineCounts,
  getPurchaseOrderHeader,
  getPurchaseOrderLines,
  getUserPurchaseOrders
} from '../services/purchaseOrdersService.js';
import { createGoodsReceiptPo, fetchPurchaseOrderFromSap } from '../services/sapPoService.js';

function statusOf(v) {
  if (v === 'O' || v === 'bost_Open') return 'O';
  if (v === 'C' || v === 'bost_Close') return 'C';
  return v || '';
}

function lineFromSql(r) {
  return {
    lineNum: Number(r.LineNum || 0),
    itemCode: r.ItemCode || '',
    itemDescription: r.Dscription || '',
    quantity: Number(r.OpenQty ?? r.Quantity ?? 0),
    orderedQuantity: Number(r.Quantity || 0),
    openQuantity: Number(r.OpenQty || 0),
    warehouseCode: r.WhsCode || ''
  };
}

function lineFromSap(l) {
  const open = Number(l.RemainingOpenQuantity ?? l.Quantity ?? 0);
  return {
    lineNum: Number(l.LineNum || 0),
    itemCode: l.ItemCode || '',
    itemDescription: l.ItemDescription || '',
    quantity: open,
    orderedQuantity: Number(l.Quantity || 0),
    openQuantity: open,
    warehouseCode: l.WarehouseCode || ''
  };
}

async function loadPo(session, docEntry) {
  try {
    const sap = await fetchPurchaseOrderFromSap(session, docEntry);
    if (sap) {
      const lines = (sap.DocumentLines || []).map(lineFromSap);
      return {
        docEntry: Number(sap.DocEntry),
        docNum: String(sap.DocNum || ''),
        cardCode: sap.CardCode || '',
        cardName: sap.CardName || '',
        docDate: sap.DocDate || null,
        documentStatus: statusOf(sap.DocumentStatus),
        cancelStatus: sap.CancelStatus || '',
        lines,
        openLineCount: lines.filter((x) => x.openQuantity > 0).length
      };
    }
  } catch (_) {}

  const h = await getPurchaseOrderHeader(docEntry);
  if (!h) return null;

  const map = await getPurchaseOrderLines([docEntry]);
  const lines = (map.get(Number(docEntry)) || []).map(lineFromSql);

  return {
    docEntry: Number(h.DocEntry),
    docNum: String(h.DocNum || ''),
    cardCode: h.CardCode || '',
    cardName: h.CardName || '',
    docDate: h.DocDate || null,
    documentStatus: statusOf(h.DocStatus),
    cancelStatus: h.CANCELED === 'Y' ? 'csYes' : 'csNo',
    lines,
    openLineCount: lines.filter((x) => x.openQuantity > 0).length
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
      let rows = await getUserPurchaseOrders(username, status !== 'all' && status !== 'closed' && status !== 'c');
      if (status === 'closed' || status === 'c') {
        rows = rows.filter((r) => r.DocStatus === 'C');
      }

      const counts = await getOpenLineCounts(rows.map((r) => r.DocEntry));
      const data = rows.map((r) => {
        const docEntry = Number(r.DocEntry);
        return {
          docEntry,
          docNum: String(r.DocNum || ''),
          cardCode: r.CardCode || '',
          cardName: r.CardName || '',
          docDate: r.DocDate || null,
          documentStatus: statusOf(r.DocStatus),
          openLineCount: counts.get(docEntry) || 0,
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
