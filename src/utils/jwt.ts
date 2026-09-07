import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env";

export function generateToken(user: { id: string; role: string; email: string; userType: string }) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      userType: user.userType,
    },
    getJwtSecret(),
    { expiresIn: "8h" }
  );
}

export function verifyToken(token: string) {
  return jwt.verify(token, getJwtSecret());
}