import axios from 'axios';
import https from 'https';
import { assertSapConfig, sapConfig } from '../config/sap.js';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export function createSapClient(session = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (session.sessionId) {
    let cookie = `B1SESSION=${session.sessionId}`;
    if (session.routeId) cookie += `; ROUTEID=${session.routeId}`;
    headers.Cookie = cookie;
  }

  return axios.create({
    baseURL: sapConfig.baseUrl,
    httpsAgent,
    headers,
    timeout: 30000,
    validateStatus: () => true
  });
}

function parseCookies(setCookie = []) {
  const list = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  let sessionId = null;
  let routeId = null;

  for (const c of list) {
    const s = c.match(/B1SESSION=([^;]+)/i);
    const r = c.match(/ROUTEID=([^;]+)/i);
    if (s) sessionId = s[1];
    if (r) routeId = r[1];
  }

  return { sessionId, routeId };
}

function sapError(res, fallback) {
  return (
    res?.data?.error?.message?.value ||
    res?.data?.error?.message ||
    res?.data?.message ||
    fallback
  );
}

export async function loginToSap({ username, password }) {
  assertSapConfig();

  const client = createSapClient();
  const res = await client.post('/Login', {
    CompanyDB: sapConfig.companyDB,
    UserName: username,
    Password: password
  });

  if (res.status < 200 || res.status >= 300) {
    const err = new Error(sapError(res, 'sap login failed'));
    err.statusCode = res.status === 401 ? 401 : 400;
    throw err;
  }

  const cookies = parseCookies(res.headers['set-cookie']);
  const sessionId = cookies.sessionId || res.data?.SessionId;
  const routeId = cookies.routeId || null;

  if (!sessionId) {
    const err = new Error('no sap session');
    err.statusCode = 500;
    throw err;
  }

  return {
    session: { sessionId, routeId },
    user: { username, companyDB: sapConfig.companyDB }
  };
}

export async function logoutFromSap({ sessionId, routeId }) {
  assertSapConfig();
  if (!sessionId) {
    const err = new Error('sessionId required');
    err.statusCode = 400;
    throw err;
  }

  const client = createSapClient({ sessionId, routeId });
  const res = await client.post('/Logout');

  if (res.status < 200 || res.status >= 300) {
    const err = new Error(sapError(res, 'sap logout failed'));
    err.statusCode = res.status === 401 ? 401 : 400;
    throw err;
  }

  return true;
}
