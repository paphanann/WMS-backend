import { createSapClient } from './sapAuthService.js';

function errMsg(res, fallback) {
  return res?.data?.error?.message?.value || res?.data?.error?.message || fallback;
}

export async function fetchWarehouses(session) {
  const client = createSapClient(session);
  const res = await client.get(
    '/Warehouses?$select=WarehouseCode,WarehouseName&$orderby=WarehouseCode&$top=200'
  );

  if (res.status < 200 || res.status >= 300) {
    const e = new Error(errMsg(res, 'ดึงคลังสินค้าไม่สำเร็จ'));
    e.statusCode = res.status || 400;
    throw e;
  }

  return (res.data?.value || []).map((w) => ({
    warehouseCode: w.WarehouseCode || '',
    warehouseName: w.WarehouseName || ''
  }));
}
