import { createSapClient } from './sapAuthService.js';

function errMsg(res, fallback) {
  return res?.data?.error?.message?.value || res?.data?.error?.message || fallback;
}

function esc(v) {
  return String(v ?? '').replace(/'/g, "''");
}

export async function searchProducts(session, { q = '', inventoryItem, top = 50 } = {}) {
  const client = createSapClient(session);
  const filters = [];

  // default: เฉพาะ inventory
  const inv = String(inventoryItem ?? 'tYES').toLowerCase();
  if (inv === 'tyes' || inv === 'yes' || inv === '1' || inv === 'true' || inv === '') {
    filters.push("InventoryItem eq 'tYES'");
  }

  const keyword = String(q || '').trim();
  if (keyword) {
    const k = esc(keyword);
    filters.push(`(contains(ItemCode,'${k}') or contains(ItemName,'${k}'))`);
  }

  let url =
    '/Items?$select=ItemCode,ItemName,InventoryItem' +
    `&$top=${Math.min(Number(top) || 50, 200)}` +
    '&$orderby=ItemCode';
  if (filters.length) url += `&$filter=${encodeURIComponent(filters.join(' and '))}`;

  const res = await client.get(url);
  if (res.status < 200 || res.status >= 300) {
    const e = new Error(errMsg(res, 'ค้นหาสินค้าไม่สำเร็จ'));
    e.statusCode = res.status || 400;
    throw e;
  }

  const seen = new Set();
  const out = [];
  for (const it of res.data?.value || []) {
    const code = it.ItemCode || '';
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({
      itemCode: code,
      itemName: it.ItemName || '',
      inventoryItem: it.InventoryItem || ''
    });
  }
  return out;
}
