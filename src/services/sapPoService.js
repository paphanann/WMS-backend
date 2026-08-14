import { createSapClient } from './sapAuthService.js';

function errMsg(res, fallback) {
  return res?.data?.error?.message?.value || res?.data?.error?.message || fallback;
}

export async function fetchPurchaseOrderFromSap(session, docEntry) {
  const client = createSapClient(session);
  const url =
    `/PurchaseOrders(${docEntry})` +
    '?$select=DocEntry,DocNum,CardCode,CardName,DocDate,DocumentStatus,CancelStatus' +
    '&$expand=DocumentLines($select=LineNum,ItemCode,ItemDescription,Quantity,RemainingOpenQuantity,WarehouseCode)';

  const res = await client.get(url);
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
  const whsDefault = body.warehouse || '';
  const lines = [];

  for (const l of body.lines || []) {
    const qty = Number(l.receivedQty);
    if (!(qty > 0)) continue;

    const row = {
      BaseType: 22,
      BaseEntry: Number(po.docEntry),
      BaseLine: Number(l.lineNum),
      Quantity: qty
    };

    const whs = l.warehouseCode || whsDefault;
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
  if (body.receiveDate) payload.DocDate = body.receiveDate;
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
