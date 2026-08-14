export function requireSapSession(req, res, next) {
  const sessionId = req.headers['x-session-id'] || req.headers.b1session;
  const routeId = req.headers['x-route-id'] || req.headers.routeid || null;

  if (!sessionId) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
  }

  req.sapSession = { sessionId, routeId };
  next();
}
