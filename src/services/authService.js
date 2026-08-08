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
  } catch (userError) {
    // ถ้าเป็นรหัส SAP ผิดของ user นี้ และยังไม่มี fallback บัญชีบริการตอน login SAP โดยตรง
    // จะ throw ต่อให้ผู้เรียกจัดการ
    throw userError;
  }
}

async function connectSapWithFallback(username, password) {
  try {
    return await connectSapSession(username, password);
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
  let wmsUser = null;

  // 1) ลองฐานเรา WMS_DATABASE ก่อน
  try {
    wmsUser = await loginWithWmsUser({ username, password });
  } catch (wmsError) {
    // 2) ถ้าไม่มีในฐานเรา แต่เปิด SAP ไว้ ให้ลองเข้า SAP โดยตรง
    if (!sapEnabled) {
      throw wmsError;
    }

    try {
      const sap = await connectSapSession(username, password);

      return {
        loginType: 'sap',
        user: {
          username,
          fullName: username,
          database: null,
          companyDB: sap.companyDB,
          sapUsername: sap.sapUsername
        },
        session: sap.session
      };
    } catch (sapError) {
      console.warn('SAP login ล้มเหลว:', sapError.message);
      const error = new Error(sapError.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      error.statusCode = sapError.statusCode || 401;
      throw error;
    }
  }

  // 3) มีในฐานเราแล้ว พยายามผูก SAP (ถ้าไม่ได้ยังเข้า WMS ได้)
  if (sapEnabled) {
    try {
      const sap = await connectSapWithFallback(username, password);

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
