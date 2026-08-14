import 'dotenv/config';

const useWindowsAuth = (process.env.DB_AUTH || '').toLowerCase() === 'windows';

// don't import both mssql + msnodesqlv8 or requests break
export const sql = useWindowsAuth
  ? (await import('mssql/msnodesqlv8.js')).default
  : (await import('mssql')).default;

let wmsPool = null;
let sapPool = null;

function buildConfig(database) {
  if (useWindowsAuth) {
    return {
      server: process.env.DB_SERVER,
      database,
      driver: 'msnodesqlv8',
      options: {
        trustedConnection: true,
        trustServerCertificate: true
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    };
  }

  return {
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    database,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: false,
      trustServerCertificate: true
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
  };
}

async function connectPool(current, database) {
  if (current?.connected) return current;
  const pool = await new sql.ConnectionPool(buildConfig(database)).connect();
  console.log(`sql connected -> ${database}`);
  return pool;
}

export async function connectDatabase() {
  wmsPool = await connectPool(wmsPool, process.env.DB_DATABASE || 'WMS_DATABASE');
  sapPool = await connectPool(sapPool, process.env.SAP_COMPANY_DB || 'WMS_W9');
  return wmsPool;
}

export function getDatabasePool() {
  if (!wmsPool?.connected) throw new Error('wms db not connected');
  return wmsPool;
}

export function getWmsDatabasePool() {
  return getDatabasePool();
}

export function getSapDatabasePool() {
  if (!sapPool?.connected) throw new Error('sap db not connected');
  return sapPool;
}

export async function checkDatabase() {
  const pool = await connectDatabase();
  const result = await pool
    .request()
    .query('SELECT DB_NAME() AS databaseName, SYSTEM_USER AS loginName, GETDATE() AS serverTime');
  return result.recordset[0];
}
