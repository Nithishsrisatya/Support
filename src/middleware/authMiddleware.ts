import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env";

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

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
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

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    
    // Explicitly mapping the payload to the request object
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      userType: decoded.userType, // This ensures the roleMiddleware can see it
      fullName: decoded.fullName,
    };

    next();
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
}