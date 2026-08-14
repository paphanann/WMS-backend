import { getSapDatabasePool, sql } from '../config/database.js';

function toIds(docEntries) {
  return (docEntries || []).map(Number).filter((n) => !Number.isNaN(n));
}

export async function getPurchaseOrderLines(docEntries) {
  const ids = toIds(docEntries);
  if (!ids.length) return new Map();

  const result = await getSapDatabasePool().request().query(`
    SELECT DocEntry, LineNum, ItemCode, Dscription, Quantity, OpenQty, WhsCode, Price, LineTotal, unitMsr
    FROM POR1
    WHERE DocEntry IN (${ids.join(',')})
    ORDER BY DocEntry, LineNum
  `);

  const map = new Map();
  for (const row of result.recordset) {
    const key = Number(row.DocEntry);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export async function getOpenLineCounts(docEntries) {
  const ids = toIds(docEntries);
  if (!ids.length) return new Map();

  const result = await getSapDatabasePool().request().query(`
    SELECT DocEntry, SUM(CASE WHEN OpenQty > 0 THEN 1 ELSE 0 END) AS OpenLineCount
    FROM POR1
    WHERE DocEntry IN (${ids.join(',')})
    GROUP BY DocEntry
  `);

  return new Map(result.recordset.map((r) => [Number(r.DocEntry), Number(r.OpenLineCount || 0)]));
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
      FROM OPOR
      WHERE DocEntry = @docEntry
    `);

  return result.recordset[0] || null;
}
