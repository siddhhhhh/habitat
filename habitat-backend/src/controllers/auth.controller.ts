import { Request, Response } from "express";
import { successResponse, errorResponse } from "../utils/responses";
import * as AuthService from "../services/auth.service";
import User from "../models/user.model";
import { registerSchema, loginSchema } from "../utils/validator";

export const register = async (req: Request, res: Response) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return errorResponse(res, error.details[0].message, 400);

    const user = await AuthService.createUser(value);
    const token = AuthService.generateAccessToken(user);
    const { raw: refreshToken } = await AuthService.issueRefreshToken(String(user._id));

    const safeUser = user.toObject() as Record<string, any>;
    delete safeUser.password;

    return successResponse(
      res,
      { user: safeUser, token, refreshToken },
      "User registered",
      201
    );
  } catch (err: any) {
    return errorResponse(res, err.message || "Registration failed", 400);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return errorResponse(res, error.details[0].message, 400);

    const user = await User.findOne({ email: value.email });
    if (!user) return errorResponse(res, "Invalid credentials", 401);
    if (!user.isActive) return errorResponse(res, "Account disabled", 401);

    const valid = await AuthService.validatePassword(value.password, user.password);
    if (!valid) return errorResponse(res, "Invalid credentials", 401);

    const token = AuthService.generateAccessToken(user);
    const { raw: refreshToken } = await AuthService.issueRefreshToken(String(user._id));

    const safeUser = user.toObject() as Record<string, any>;
    delete safeUser.password;

    return successResponse(
      res,
      { user: safeUser, token, refreshToken },
      "Logged in successfully"
    );
  } catch (err: any) {
    return errorResponse(res, err.message || "Login failed", 400);
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const presented = req.body?.refreshToken;
    if (!presented || typeof presented !== "string") {
      return errorResponse(res, "refreshToken is required", 400);
    }

    const { user, access, refresh: nextRefresh } = await AuthService.rotateRefreshToken(presented);

    const safeUser = user.toObject() as Record<string, any>;
    delete safeUser.password;

    return successResponse(
      res,
      { user: safeUser, accessToken: access, refreshToken: nextRefresh },
      "Token refreshed"
    );
  } catch (err: any) {
    return errorResponse(res, err.message || "Refresh failed", 401);
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const presented = req.body?.refreshToken;
    if (presented && typeof presented === "string") {
      await AuthService.revokeRefreshToken(presented);
    }
    return successResponse(res, null, "Logged out");
  } catch (err: any) {
    return errorResponse(res, err.message || "Logout failed", 400);
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return errorResponse(res, "Unauthorized", 401);

    const user = await User.findById(userId).select("-password");
    if (!user) return errorResponse(res, "User not found", 404);

    return successResponse(res, user, "Current user");
  } catch (err: any) {
    return errorResponse(res, err.message || "Failed to fetch user", 400);
  }
};
