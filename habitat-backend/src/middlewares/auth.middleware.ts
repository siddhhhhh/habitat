import { Request, Response, NextFunction } from "express";
import { errorResponse } from "../utils/responses";
import User from "../models/user.model";
import { verifyAccessToken } from "../services/auth.service";

export const verifyAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header) return errorResponse(res, "Authorization header missing", 401);

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) return errorResponse(res, "Invalid auth format", 401);

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.id).select("-password");
    if (!user) return errorResponse(res, "User not found", 401);
    if (!user.isActive) return errorResponse(res, "Account disabled", 401);

    req.user = user;
    next();
  } catch (err: any) {
    return errorResponse(res, err.message || "Authentication failed", 401);
  }
};
