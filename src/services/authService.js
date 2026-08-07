import { sapConfig, assertSapServiceAccount } from '../config/sap.js';
import { loginToSap } from './sapAuthService.js';
import { loginWithWmsUser } from './wmsAuthService.js';

export async function login({ username, password, type = 'wms' }) {
  const loginType = String(type || 'wms').toLowerCase();

  if (loginType === 'sap') {
    const sapResult = await loginToSap({ username, password });

    return {
      loginType: 'sap',
      user: {
        username: sapResult.user.username,
        companyDB: sapResult.user.companyDB
      },
      session: sapResult.session
    };
  }

  const wmsUser = await loginWithWmsUser({ username, password });

  assertSapServiceAccount();

  const sapResult = await loginToSap({
    username: sapConfig.serviceUsername,
    password: sapConfig.servicePassword
  });

  return {
    loginType: 'wms',
    user: {
      ...wmsUser,
      companyDB: sapConfig.companyDB,
      sapUsername: sapConfig.serviceUsername
    },
    session: sapResult.session
  };
}
