import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env";
import { pool } from "../db";

// Define the interface to ensure userType is accessible
interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    userType: string;
    fullName?: string;
  };
}

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (typeof req.query.token === "string" && req.query.token.trim().length > 0) {
    token = req.query.token.trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Access token required." });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, getJwtSecret()) as any;
  } catch (err: any) {
    // 1. Specifically handle expiration
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: "Your session has expired. Please log in again." 
      });
    }

    // 2. Handle all other invalid token scenarios as 403
    return res.status(403).json({ 
      success: false, 
      message: "Authentication failed. Please check your credentials." 
    });
  }

  try {
    let dbUser: { id: string; status: string; fullName?: string; role?: string; email?: string } | null = null;
    let resolvedUserType = decoded.userType || (decoded.role === 'Client' ? 'Client' : 'User');

    if (resolvedUserType === 'Client') {
      const clientRes = await pool.query(
        'SELECT id, status, contact_person AS "fullName", email FROM clients WHERE id = $1',
        [decoded.id]
      );
      if (clientRes.rows.length > 0) {
        dbUser = { ...clientRes.rows[0], role: 'Client' };
      }
    } else {
      const userRes = await pool.query(
        'SELECT id, status, full_name AS "fullName", email, role FROM users WHERE id = $1',
        [decoded.id]
      );
      if (userRes.rows.length > 0) {
        dbUser = userRes.rows[0];
      }
    }

    // Fallback if userType in token was ambiguous/missing
    if (!dbUser) {
      if (resolvedUserType === 'Client') {
        const userRes = await pool.query(
          'SELECT id, status, full_name AS "fullName", email, role FROM users WHERE id = $1',
          [decoded.id]
        );
        if (userRes.rows.length > 0) {
          dbUser = userRes.rows[0];
          resolvedUserType = 'User';
        }
      } else {
        const clientRes = await pool.query(
          'SELECT id, status, contact_person AS "fullName", email FROM clients WHERE id = $1',
          [decoded.id]
        );
        if (clientRes.rows.length > 0) {
          dbUser = { ...clientRes.rows[0], role: 'Client' };
          resolvedUserType = 'Client';
        }
      }
    }

    // If user record doesn't exist in database (e.g. deleted user)
    if (!dbUser) {
      return res.status(401).json({
        success: false,
        message: "Account not found or has been deleted.",
      });
    }

    // If user account is deactivated / inactive / suspended / disabled
    if (dbUser.status !== 'Active') {
      return res.status(401).json({
        success: false,
        message: "Account is inactive or deactivated. Please contact support.",
      });
    }

    // Explicitly mapping the verified active user to the request object
    req.user = {
      id: dbUser.id,
      role: dbUser.role || decoded.role,
      email: dbUser.email || decoded.email,
      userType: resolvedUserType,
      fullName: dbUser.fullName || decoded.fullName,
    };

    next();
  } catch (dbErr: any) {
    console.error("Database authentication check error:", dbErr);
    return res.status(401).json({
      success: false,
      message: "Authentication verification failed.",
    });
  }
}