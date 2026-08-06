export const sapConfig = {
  baseUrl: process.env.SAP_BASE_URL,
  companyDB: process.env.SAP_COMPANY_DB
};

export function assertSapConfig() {
  if (!sapConfig.baseUrl) {
    throw new Error('ยังไม่ได้ตั้งค่า SAP_BASE_URL');
  }

  if (!sapConfig.companyDB) {
    throw new Error('ยังไม่ได้ตั้งค่า SAP_COMPANY_DB');
  }
}
