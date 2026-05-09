import { Router } from 'express';
import { VisitorsController } from '../controllers/visitors.controller';
import { verifyAuth } from '../middlewares/auth.middleware';
import { permit } from '../middlewares/role.middleware';
import { UserRole } from '../utils/enums';

const router = Router();
const controller = new VisitorsController();

const staffRoles = [UserRole.Admin, UserRole.Committee, UserRole.Security];

router.use(verifyAuth);

router.get('/', permit(staffRoles), controller.getAll.bind(controller));
router.get('/:id', permit(staffRoles), controller.getById.bind(controller));
router.post('/', permit(staffRoles), controller.create.bind(controller));
router.put('/:id', permit(staffRoles), controller.update.bind(controller));
router.patch('/:id/checkout', permit(staffRoles), controller.checkoutVisitor.bind(controller));
router.delete('/:id', permit([UserRole.Admin, UserRole.Committee]), controller.delete.bind(controller));

export default router;
