import sql from 'mssql';

import { getDatabasePool } from '../config/database.js';

export async function loginWithWmsUser({ username, password }) {
  const pool = getDatabasePool();

  const result = await pool
    .request()
    .input('username', sql.NVarChar, username)
    .query(`
      SELECT TOP 1
        UserID,
        Username,
        PasswordHash,
        FullName,
        Role,
        Email
      FROM dbo.Users
      WHERE Username = @username
    `);

  const user = result.recordset[0];

  if (!user || user.PasswordHash !== password) {
    const error = new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    error.statusCode = 401;
    throw error;
  }

  return {
    userId: user.UserID,
    username: user.Username,
    fullName: user.FullName,
    role: user.Role,
    email: user.Email,
    database: process.env.DB_DATABASE || 'WMS_DATABASE'
  };
}
