import { Router } from 'express';
import { AmenitiesController } from '../controllers/amenities.controller';
import { verifyAuth } from '../middlewares/auth.middleware';
import { permit } from '../middlewares/role.middleware';
import { UserRole } from '../utils/enums';

const router = Router();
const controller = new AmenitiesController();

router.use(verifyAuth);

router.get('/', controller.getAll.bind(controller));
router.get('/:id', controller.getById.bind(controller));

router.post('/', permit([UserRole.Admin, UserRole.Committee]), controller.create.bind(controller));
router.put('/:id', permit([UserRole.Admin, UserRole.Committee]), controller.update.bind(controller));
router.delete('/:id', permit([UserRole.Admin, UserRole.Committee]), controller.delete.bind(controller));

export default router;
