import { assertSapServiceAccount, sapConfig } from '../config/sap.js';
import { loginWithWmsUser } from './wmsAuthService.js';
import { loginToSap } from './sapAuthService.js';

const sapEnabled = (process.env.SAP_ENABLED || '').toLowerCase() === 'true';

async function sapLogin(username, password) {
  const result = await loginToSap({ username, password });
  return {
    session: result.session,
    sapUsername: username,
    companyDB: result.user.companyDB
  };
}

async function sapLoginOrService(username, password) {
  try {
    return await sapLogin(username, password);
  } catch {
    assertSapServiceAccount();
    const result = await loginToSap({
      username: sapConfig.serviceUsername,
      password: sapConfig.servicePassword
    });
    return {
      session: result.session,
      sapUsername: sapConfig.serviceUsername,
      companyDB: result.user.companyDB
    };
  }
}

export async function login({ username, password }) {
  let wmsUser = null;

  try {
    wmsUser = await loginWithWmsUser({ username, password });
  } catch (wmsErr) {
    if (!sapEnabled) throw wmsErr;

    try {
      const sap = await sapLogin(username, password);
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
    } catch (sapErr) {
      const err = new Error(sapErr.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      err.statusCode = sapErr.statusCode || 401;
      throw err;
    }
  }

  if (sapEnabled) {
    try {
      const sap = await sapLoginOrService(username, password);
      return {
        loginType: 'wms+sap',
        user: {
          ...wmsUser,
          companyDB: sap.companyDB,
          sapUsername: sap.sapUsername
        },
        session: sap.session
      };
    } catch (err) {
      console.warn('sap login skip:', err.message);
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
