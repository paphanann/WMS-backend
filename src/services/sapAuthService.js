import axios from 'axios';
import https from 'https';

import { assertSapConfig, sapConfig } from '../config/sap.js';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

export function createSapClient(session = {}) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (session.sessionId) {
    const cookies = [`B1SESSION=${session.sessionId}`];

    if (session.routeId) {
      cookies.push(`ROUTEID=${session.routeId}`);
    }

    headers.Cookie = cookies.join('; ');
  }

  return axios.create({
    baseURL: sapConfig.baseUrl,
    httpsAgent,
    headers,
    timeout: 30000,
    validateStatus: () => true
  });
}

function parseCookies(setCookieHeader = []) {
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader].filter(Boolean);

  let sessionId = null;
  let routeId = null;

  for (const cookie of cookies) {
    const sessionMatch = cookie.match(/B1SESSION=([^;]+)/i);
    const routeMatch = cookie.match(/ROUTEID=([^;]+)/i);

    if (sessionMatch) {
      sessionId = sessionMatch[1];
    }

    if (routeMatch) {
      routeId = routeMatch[1];
    }
  }

  return { sessionId, routeId };
}

function getSapErrorMessage(response) {
  return (
    response?.data?.error?.message?.value ||
    response?.data?.error?.message ||
    response?.data?.message ||
    'เข้าสู่ระบบ SAP ไม่สำเร็จ'
  );
}

export async function loginToSap({ username, password }) {
  assertSapConfig();

  const client = createSapClient();
  const response = await client.post('/Login', {
    CompanyDB: sapConfig.companyDB,
    UserName: username,
    Password: password
  });

  if (response.status < 200 || response.status >= 300) {
    const error = new Error(getSapErrorMessage(response));
    error.statusCode = response.status === 401 ? 401 : 400;
    throw error;
  }

  const cookieSession = parseCookies(response.headers['set-cookie']);
  const sessionId = cookieSession.sessionId || response.data?.SessionId;
  const routeId = cookieSession.routeId || null;

  if (!sessionId) {
    const error = new Error('ไม่พบ Session จาก SAP Service Layer');
    error.statusCode = 500;
    throw error;
  }

  return {
    session: {
      sessionId,
      routeId
    },
    user: {
      username,
      companyDB: sapConfig.companyDB
    }
  };
}

export async function logoutFromSap({ sessionId, routeId }) {
  assertSapConfig();

  if (!sessionId) {
    const error = new Error('ต้องระบุ sessionId');
    error.statusCode = 400;
    throw error;
  }

  const client = createSapClient({ sessionId, routeId });
  const response = await client.post('/Logout');

  if (response.status < 200 || response.status >= 300) {
    const error = new Error(getSapErrorMessage(response));
    error.statusCode = response.status === 401 ? 401 : 400;
    throw error;
  }

  return true;
}
