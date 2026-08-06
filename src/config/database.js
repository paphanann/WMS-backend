import sql from 'mssql';
import sqlWindows from 'mssql/msnodesqlv8.js';

const useWindowsAuth =
  String(process.env.DB_AUTH || '').toLowerCase() === 'windows';

const databaseConfig = useWindowsAuth
  ? {
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
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
    }
  : {
      server: process.env.DB_SERVER,
      port: Number(process.env.DB_PORT || 1433),
      database: process.env.DB_DATABASE,
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

const client = useWindowsAuth ? sqlWindows : sql;

let pool;

export async function connectDatabase() {
  try {
    if (pool?.connected) {
      return pool;
    }

    pool = await client.connect(databaseConfig);

    console.log(
      `เชื่อมต่อ SQL Server สำเร็จ (${useWindowsAuth ? 'Windows Auth' : 'SQL Auth'}) -> ${process.env.DB_DATABASE}`
    );

    return pool;
  } catch (error) {
    console.error('เชื่อมต่อ SQL Server ไม่สำเร็จ:', error.message);
    throw error;
  }
}

export function getDatabasePool() {
  if (!pool?.connected) {
    throw new Error('ยังไม่ได้เชื่อมต่อฐานข้อมูล');
  }

  return pool;
}

export async function checkDatabase() {
  const activePool = await connectDatabase();
  const result = await activePool
    .request()
    .query('SELECT DB_NAME() AS databaseName, SYSTEM_USER AS loginName, GETDATE() AS serverTime');

  return result.recordset[0];
}
