export const sapConfig = {
  baseUrl: process.env.SAP_BASE_URL,
  companyDB: process.env.SAP_COMPANY_DB,
  serviceUsername: process.env.SAP_USERNAME,
  servicePassword: process.env.SAP_PASSWORD
};

export function assertSapConfig() {
  if (!sapConfig.baseUrl || !sapConfig.companyDB) {
    throw new Error('missing SAP_BASE_URL / SAP_COMPANY_DB');
  }
}

export function assertSapServiceAccount() {
  assertSapConfig();
  if (!sapConfig.serviceUsername || !sapConfig.servicePassword) {
    throw new Error('missing SAP_USERNAME / SAP_PASSWORD');
  }
}
