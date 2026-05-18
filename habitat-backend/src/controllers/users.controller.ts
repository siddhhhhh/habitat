import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import User from "../models/user.model";
import { successResponse, errorResponse } from "../utils/responses";
import { updateUserSchema } from "../utils/validator";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

// GET all users
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find().select("-password");
    return successResponse(res, users, "All users fetched successfully");
  } catch (err: any) {
    return errorResponse(res, err.message);
  }
};

// GET user by ID
export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return errorResponse(res, "User not found", 404);
    return successResponse(res, user);
  } catch (err: any) {
    return errorResponse(res, err.message);
  }
};

// UPDATE user
export const updateUser = async (req: Request, res: Response) => {
  try {
    const value = req.body; // skip validation

    if (value.password) {
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      value.password = await bcrypt.hash(value.password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, value, {
      new: true,
    }).select("-password");

    if (!updatedUser) return errorResponse(res, "User not found", 404);
    return successResponse(res, updatedUser, "User updated successfully");
  } catch (err: any) {
    return errorResponse(res, err.message);
  }
};


export const deleteUser = async (req: Request, res: Response) => {
  console.log(`🔴 deleteUser called for ID: ${req.params.id} by user:`, req.user);

  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id).select("-password");
    if (!deletedUser) {
      console.log(`⚠️ User not found: ${req.params.id}`);
      return errorResponse(res, "User not found", 404);
    }

    console.log(`✅ User deleted: ${deletedUser._id}`);
    return successResponse(res, deletedUser, "User deleted successfully");
  } catch (err: any) {
    console.error("❌ deleteUser error:", err.message);
    return errorResponse(res, err.message);
  }
};


export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, role, flatNumber, building, occupantsCount, profile } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      role,
      flatNumber,
      building,
      occupantsCount,
      profile,
    });

    await user.save();
    console.log("📥 Incoming data:", req.body);

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
