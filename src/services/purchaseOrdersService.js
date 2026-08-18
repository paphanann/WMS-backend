import { getSapDatabasePool, sql } from '../config/database.js';

function toIds(list) {
  return (list || []).map(Number).filter((n) => !Number.isNaN(n));
}

export async function getPurchaseOrderLines(docEntries) {
  const ids = toIds(docEntries);
  if (!ids.length) return new Map();

  const result = await getSapDatabasePool().request().query(`
    SELECT
      T0.DocEntry, T0.LineNum, T0.ItemCode, T0.Dscription,
      T0.Quantity, T0.OpenQty, T0.WhsCode, T1.WhsName,
      T0.Price, T0.LineTotal, T0.unitMsr
    FROM POR1 T0
    LEFT JOIN OWHS T1 ON T0.WhsCode = T1.WhsCode
    WHERE T0.DocEntry IN (${ids.join(',')})
    ORDER BY T0.DocEntry, T0.LineNum
  `);

  const map = new Map();
  for (const row of result.recordset) {
    const key = Number(row.DocEntry);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export async function getWarehouseNameMap(codes = []) {
  const list = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))];
  if (!list.length) return new Map();

  const inList = list.map((c) => `N'${c.replace(/'/g, "''")}'`).join(',');
  const result = await getSapDatabasePool().request().query(`
    SELECT WhsCode, WhsName FROM OWHS WHERE WhsCode IN (${inList})
  `);

  return new Map(result.recordset.map((r) => [String(r.WhsCode), String(r.WhsName || '')]));
}

export async function getPoLineStats(docEntries) {
  const ids = toIds(docEntries);
  if (!ids.length) return new Map();

  const result = await getSapDatabasePool().request().query(`
    SELECT DocEntry,
           COUNT(*) AS OpenLineCount,
           SUM(OpenQty) AS TotalQty
    FROM POR1
    WHERE DocEntry IN (${ids.join(',')}) AND LineStatus = 'O'
    GROUP BY DocEntry
  `);

  const map = new Map();
  for (const r of result.recordset) {
    map.set(Number(r.DocEntry), {
      openLineCount: Number(r.OpenLineCount || 0),
      totalQty: Number(r.TotalQty || 0)
    });
  }
  return map;
}

export async function getUserPurchaseOrders(username, openOnly = true) {
  const result = await getSapDatabasePool()
    .request()
    .input('username', sql.NVarChar, username)
    .query(`
      SELECT T0.DocEntry, T0.DocNum, T0.CardCode, T0.CardName, T0.DocDate, T0.DocStatus, T0.CANCELED
      FROM OPOR T0
      INNER JOIN OUSR T1 ON T0.UserSign = T1.USERID
      WHERE T1.USER_CODE = @username
      ${openOnly ? "AND T0.DocStatus = 'O'" : ''}
      ORDER BY T0.DocEntry DESC
    `);
  return result.recordset;
}

export async function getPurchaseOrderHeader(docEntry) {
  const result = await getSapDatabasePool()
    .request()
    .input('docEntry', sql.Int, Number(docEntry))
    .query(`
      SELECT DocEntry, DocNum, CardCode, CardName, DocDate, DocStatus, CANCELED
      FROM OPOR WHERE DocEntry = @docEntry
    `);
  return result.recordset[0] || null;
}
