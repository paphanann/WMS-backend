import sql from 'mssql';

import { getSapDatabasePool } from '../config/database.js';
import { createSapClient } from './sapAuthService.js';

function getSapErrorMessage(response) {
  return (
    response?.data?.error?.message?.value ||
    response?.data?.error?.message ||
    response?.data?.message ||
    'ดึง Purchase Orders จาก SAP ไม่สำเร็จ'
  );
}

function mapLine(row) {
  return {
    lineNum: Number(row.LineNum ?? 0),
    itemCode: row.ItemCode || '',
    itemName: row.Dscription || row.ItemName || '',
    quantity: Number(row.Quantity ?? 0),
    openQuantity: Number(row.OpenQty ?? row.OpenQuantity ?? 0),
    warehouseCode: row.WhsCode || row.WarehouseCode || '',
    unitPrice: Number(row.Price ?? row.UnitPrice ?? 0),
    lineTotal: Number(row.LineTotal ?? 0),
    uom: row.unitMsr || row.Uom || ''
  };
}

function mapHeader(row, lines = []) {
  const mappedLines = lines.map(mapLine);
  const openLineCount = mappedLines.filter((line) => line.openQuantity > 0).length;
  const openQuantityTotal = mappedLines.reduce(
    (sum, line) => sum + (line.openQuantity > 0 ? line.openQuantity : 0),
    0
  );

  return {
    docEntry: Number(row.DocEntry),
    docNum: String(row.DocNum ?? ''),
    cardCode: row.CardCode || '',
    cardName: row.CardName || '',
    docDate: row.DocDate || null,
    docDueDate: row.DocDueDate || null,
    docTotal: Number(row.DocTotal || 0),
    documentStatus: row.DocStatus || 'O',
    comments: row.Comments || '',
    userCode: row.UserCode || null,
    lineCount: mappedLines.length,
    openLineCount,
    openQuantityTotal,
    itemCount: mappedLines.length,
    lines: mappedLines
  };
}

export async function getUserPurchaseOrderKeys(username) {
  const pool = getSapDatabasePool();

  const result = await pool
    .request()
    .input('username', sql.NVarChar, username)
    .query(`
      SELECT
        T0.DocEntry,
        T0.DocNum,
        T0.CardCode,
        T0.CardName,
        T0.DocDate,
        T0.DocDueDate,
        T0.DocTotal,
        T0.DocStatus,
        T0.Comments,
        T1.USER_CODE AS UserCode,
        T1.U_NAME AS UserName
      FROM OPOR T0
      INNER JOIN OUSR T1 ON T0.UserSign = T1.USERID
      WHERE T1.USER_CODE = @username
        AND T0.DocStatus = 'O'
      ORDER BY T0.DocEntry DESC
    `);

  return result.recordset;
}

export async function getPurchaseOrderLines(docEntries) {
  if (!docEntries?.length) {
    return new Map();
  }

  const pool = getSapDatabasePool();
  const result = await pool
    .request()
    .query(`
      SELECT
        DocEntry,
        LineNum,
        ItemCode,
        Dscription,
        Quantity,
        OpenQty,
        WhsCode,
        Price,
        LineTotal,
        unitMsr
      FROM POR1
      WHERE DocEntry IN (${docEntries.map((id) => Number(id)).join(',')})
      ORDER BY DocEntry, LineNum
    `);

  const grouped = new Map();

  for (const row of result.recordset) {
    const docEntry = Number(row.DocEntry);
    if (!grouped.has(docEntry)) {
      grouped.set(docEntry, []);
    }
    grouped.get(docEntry).push(row);
  }

  return grouped;
}

export async function getPurchaseOrdersFromSap({ sessionId, routeId, docEntries }) {
  if (!docEntries?.length) {
    return [];
  }

  const client = createSapClient({ sessionId, routeId });
  const filter = docEntries.map((id) => `PurchaseOrders/DocEntry eq ${Number(id)}`).join(' or ');

  const path =
    '/$crossjoin(PurchaseOrders,PurchaseOrders/DocumentLines)' +
    '?$expand=PurchaseOrders($select=DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocTotal,DocumentStatus,Comments),' +
    'PurchaseOrders/DocumentLines($select=LineNum,ItemCode,ItemDescription,Quantity,RemainingOpenQuantity,WarehouseCode,UnitPrice,LineTotal,MeasureUnit)' +
    `&$filter=${encodeURIComponent(filter)}`;

  const response = await client.get(path);

  if (response.status < 200 || response.status >= 300) {
    const error = new Error(getSapErrorMessage(response));
    error.statusCode = response.status === 401 ? 401 : 400;
    throw error;
  }

  return response.data?.value || [];
}

function mergeSapLinesIntoOrders(orders, sapRows) {
  if (!sapRows?.length) {
    return orders;
  }

  const sapLineMap = new Map();

  for (const row of sapRows) {
    const header = row.PurchaseOrders || {};
    const line = row['PurchaseOrders/DocumentLines'] || row.PurchaseOrders?.DocumentLines || {};
    const docEntry = Number(header.DocEntry);

    if (!sapLineMap.has(docEntry)) {
      sapLineMap.set(docEntry, []);
    }

    if (line.ItemCode) {
      sapLineMap.get(docEntry).push({
        LineNum: line.LineNum,
        ItemCode: line.ItemCode,
        Dscription: line.ItemDescription,
        Quantity: line.Quantity,
        OpenQty: line.RemainingOpenQuantity ?? line.Quantity,
        WhsCode: line.WarehouseCode,
        Price: line.UnitPrice,
        LineTotal: line.LineTotal,
        unitMsr: line.MeasureUnit
      });
    }
  }

  return orders.map((order) => {
    const sapLines = sapLineMap.get(order.docEntry);
    if (!sapLines?.length) {
      return order;
    }

    return mapHeader(
      {
        DocEntry: order.docEntry,
        DocNum: order.docNum,
        CardCode: order.cardCode,
        CardName: order.cardName,
        DocDate: order.docDate,
        DocDueDate: order.docDueDate,
        DocTotal: order.docTotal,
        DocStatus: order.documentStatus,
        Comments: order.comments,
        UserCode: order.userCode
      },
      sapLines
    );
  });
}

export async function getReceivePurchaseOrders({ username, sessionId, routeId }) {
  if (!username) {
    const error = new Error('ต้องระบุ username');
    error.statusCode = 400;
    throw error;
  }

  const sqlRows = await getUserPurchaseOrderKeys(username);

  if (!sqlRows.length) {
    return [];
  }

  const docEntries = sqlRows.map((row) => Number(row.DocEntry));
  const lineMap = await getPurchaseOrderLines(docEntries);

  let orders = sqlRows.map((row) =>
    mapHeader(row, lineMap.get(Number(row.DocEntry)) || [])
  );

  // ถ้ามี SAP session ลอง enrich จาก Service Layer (ถ้าพังยังใช้ SQL lines อยู่)
  if (sessionId && !String(sessionId).startsWith('wms-')) {
    try {
      const sapRows = await getPurchaseOrdersFromSap({
        sessionId,
        routeId,
        docEntries
      });
      orders = mergeSapLinesIntoOrders(orders, sapRows);
    } catch (error) {
      console.warn('SAP crossjoin PO ไม่สำเร็จ ใช้ lines จาก SQL:', error.message);
    }
  }

  return orders;
}
