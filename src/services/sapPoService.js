import { createSapClient } from './sapAuthService.js';

function errMsg(res, fallback) {
  return res?.data?.error?.message?.value || res?.data?.error?.message || fallback;
}

function toSapDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export async function fetchPurchaseOrderFromSap(session, docEntry) {
  const client = createSapClient(session);
  const res = await client.get(
    `/PurchaseOrders(${docEntry})` +
      '?$select=DocEntry,DocNum,CardCode,CardName,DocDate,DocumentStatus,CancelStatus' +
      '&$expand=DocumentLines($select=LineNum,ItemCode,ItemDescription,Quantity,RemainingOpenQuantity,WarehouseCode)'
  );

  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) {
    const e = new Error(errMsg(res, 'ดึง PO จาก SAP ไม่สำเร็จ'));
    e.statusCode = res.status;
    throw e;
  }
  return res.data;
}

export async function createGoodsReceiptPo(session, po, body) {
  const client = createSapClient(session);
  const whsDefault = (body.warehouse || '').trim();
  const lines = [];

  for (const l of body.lines || []) {
    const qty = Number(l.receivedQty ?? l.quantity);
    if (!(qty > 0)) continue;

    const extra = l.isExtra === true || Number(l.lineNum) < 0;
    const whs = (l.warehouseCode || whsDefault || '').trim();
    const row = { Quantity: qty };

    if (extra) {
      row.ItemCode = (l.itemCode || '').trim();
      if (!row.ItemCode) continue;
    } else {
      row.BaseType = 22;
      row.BaseEntry = Number(po.docEntry);
      row.BaseLine = Number(l.lineNum);
    }

    if (whs) row.WarehouseCode = whs;
    if (l.batchNo) {
      row.BatchNumbers = [{ BatchNumber: String(l.batchNo), Quantity: qty }];
    }

    lines.push(row);
  }

  if (!lines.length) {
    const e = new Error('ไม่มีรายการที่ระบุจำนวนรับ');
    e.statusCode = 400;
    throw e;
  }

  const payload = {
    CardCode: po.cardCode,
    DocumentLines: lines
  };
  const d = toSapDate(body.receiveDate);
  if (d) payload.DocDate = d;
  if (body.deliveryNote) payload.NumAtCard = body.deliveryNote;
  if (body.comments) payload.Comments = body.comments;

  const res = await client.post('/PurchaseDeliveryNotes', payload);
  if (res.status < 200 || res.status >= 300) {
    const e = new Error(errMsg(res, 'บันทึกการรับสินค้าไม่สำเร็จ'));
    e.statusCode = res.status || 400;
    throw e;
  }

  return { docEntry: res.data?.DocEntry, docNum: res.data?.DocNum };
}
