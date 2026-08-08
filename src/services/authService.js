import { assertSapServiceAccount, sapConfig } from '../config/sap.js';
import { loginWithWmsUser } from './wmsAuthService.js';
import { loginToSap } from './sapAuthService.js';

const sapEnabled = String(process.env.SAP_ENABLED || 'false').toLowerCase() === 'true';

async function connectSapSession(username, password) {
  try {
    const sapResult = await loginToSap({ username, password });
    return {
      session: sapResult.session,
      sapUsername: username,
      companyDB: sapResult.user.companyDB
    };
  } catch {
    assertSapServiceAccount();
    const sapResult = await loginToSap({
      username: sapConfig.serviceUsername,
      password: sapConfig.servicePassword
    });
    return {
      session: sapResult.session,
      sapUsername: sapConfig.serviceUsername,
      companyDB: sapResult.user.companyDB
    };
  }
}

export async function login({ username, password }) {
  // 1) ตรวจ user จากฐานเรา WMS_DATABASE ก่อน (สำคัญสุด)
  const wmsUser = await loginWithWmsUser({ username, password });

  // 2) พยายามเข้า SAP ถ้าเปิดไว้ แต่ถ้า SAP พังก็ยังให้เข้า WMS ได้
  if (sapEnabled) {
    try {
      const sap = await connectSapSession(username, password);

      return {
        loginType: 'wms+sap',
        user: {
          ...wmsUser,
          companyDB: sap.companyDB,
          sapUsername: sap.sapUsername
        },
        session: sap.session
      };
    } catch (error) {
      console.warn('เข้า SAP ไม่สำเร็จ ใช้โหมด WMS อย่างเดียว:', error.message);
    }
  }

  return {
    loginType: 'wms',
    user: wmsUser,
    session: {
      sessionId: `wms-${wmsUser.userId}-${Date.now()}`,
      routeId: null
    }
  };
}

export function isSapEnabled() {
  return sapEnabled;
}
