import { Router } from "express";
import { BillsController } from "../controllers/bills.controller";
import { PaymentsController } from "../controllers/payments.controller";
import { verifyAuth } from "../middlewares/auth.middleware";
import { permit } from "../middlewares/role.middleware";
import { UserRole } from "../utils/enums";

const router = Router();
const controller = new BillsController();
const payments = new PaymentsController();

router.use(verifyAuth);

router.get("/", controller.getAll.bind(controller));
router.get("/:id", controller.getById.bind(controller));

router.post("/:id/checkout", payments.checkout.bind(payments));

router.patch("/:id/pay", controller.payBill.bind(controller));
router.post("/:id/pay", controller.payBill.bind(controller));

router.post("/", permit([UserRole.Admin, UserRole.Committee]), controller.create.bind(controller));
router.put("/:id", permit([UserRole.Admin, UserRole.Committee]), controller.update.bind(controller));
router.delete("/:id", permit([UserRole.Admin]), controller.delete.bind(controller));
router.post("/generate", permit([UserRole.Admin, UserRole.Committee]), controller.generateBills.bind(controller));

export default router;
