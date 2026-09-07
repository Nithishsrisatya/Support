import { Request, Response, NextFunction } from "express";

export function authorizeRoles(allowedRoles: string[] = [], allowClient: boolean = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    // Normalize role casing/trimming because JWT payloads may not match exact casing.
    const normalizedRole = String(user.role ?? "").trim();
    const hasRole = allowedRoles.map(r => String(r).trim()).includes(normalizedRole);

    
    // Check if the user is a client and if the route explicitly permits clients
    const isClientAccess = allowClient && user.userType === 'Client';

    if (hasRole || isClientAccess) {
      return next();
    }

    // Debugging hint: logs to console to identify why the check failed
    console.log(`Auth Failed: User ${user.id} with role ${user.role} and type ${user.userType} denied access.`);
    // Add this inside roleMiddleware.ts right before the check
console.log("Checking Permissions:", {
  userRole: (req as any).user?.role,
  userType: (req as any).user?.userType,
  requiredRoles: allowedRoles
});
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource.",
    });
  };
}