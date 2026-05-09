import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as AuthController from "../controllers/auth.controller";
import { verifyAuth } from "../middlewares/auth.middleware";

const router = Router();

const skipInTest = () => process.env.NODE_ENV === "test";

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: "Too many login attempts. Try again in a minute." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: "Too many registration attempts. Try again later." },
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

router.post("/register", registerLimiter, AuthController.register);
router.post("/login", loginLimiter, AuthController.login);
router.post("/refresh", refreshLimiter, AuthController.refresh);
router.post("/logout", AuthController.logout);
router.get("/me", verifyAuth, AuthController.me);

export default router;
