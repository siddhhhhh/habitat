// src/utils/validator.ts
import Joi from "joi";
import { UserRole } from "./enums";

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().optional(),
  role: Joi.string().valid(...Object.values(UserRole)).optional(),
  flatNumber: Joi.string().optional(),
  building: Joi.string().optional(),
  occupantsCount: Joi.number().integer().min(1).optional(),
  profile: Joi.string().optional()
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

export const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().optional(),
  flatNumber: Joi.string().optional(),
  building: Joi.string().optional(),
  occupantsCount: Joi.number().integer().min(1).optional(),
  profile: Joi.string().optional(),
  role: Joi.string().valid(...Object.values(UserRole)).optional(),
  isActive: Joi.boolean().optional()
});
