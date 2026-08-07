import sql from 'mssql';
import sqlWindows from 'mssql/msnodesqlv8.js';

const useWindowsAuth =
  String(process.env.DB_AUTH || '').toLowerCase() === 'windows';

const driver = useWindowsAuth ? sqlWindows : sql;

const pools = {
  main: null,
  wms: null
};

function buildConfig(databaseName) {
  if (useWindowsAuth) {
    return {
      server: process.env.DB_SERVER,
      database: databaseName,
      driver: 'msnodesqlv8',
      options: {
        trustedConnection: true,
        trustServerCertificate: true
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };
  }

  return {
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    database: databaseName,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: false,
      trustServerCertificate: true
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

async function connectPool(key, databaseName) {
  if (pools[key]?.connected) {
    return pools[key];
  }

  const pool = new driver.ConnectionPool(buildConfig(databaseName));
  pools[key] = await pool.connect();

  console.log(
    `เชื่อมต่อ SQL Server สำเร็จ (${useWindowsAuth ? 'Windows Auth' : 'SQL Auth'}) -> ${databaseName}`
  );

  return pools[key];
}

export async function connectDatabase() {
  try {
    const mainDb = process.env.DB_DATABASE;
    const wmsDb = process.env.WMS_DB_DATABASE || 'WMS_DATABASE';

    await connectPool('main', mainDb);
    await connectPool('wms', wmsDb);

    return pools.main;
  } catch (error) {
    console.error('เชื่อมต่อ SQL Server ไม่สำเร็จ:', error.message);
    throw error;
  }
}

export function getDatabasePool() {
  if (!pools.main?.connected) {
    throw new Error('ยังไม่ได้เชื่อมต่อฐานข้อมูลหลัก');
  }

  return pools.main;
}

export function getWmsDatabasePool() {
  if (!pools.wms?.connected) {
    throw new Error('ยังไม่ได้เชื่อมต่อฐานข้อมูล WMS');
  }

  return pools.wms;
}

export async function checkDatabase() {
  const activePool = await connectPool('main', process.env.DB_DATABASE);
  const result = await activePool
    .request()
    .query('SELECT DB_NAME() AS databaseName, SYSTEM_USER AS loginName, GETDATE() AS serverTime');

  return result.recordset[0];
}
