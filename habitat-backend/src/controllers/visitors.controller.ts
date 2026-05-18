import { Request, Response } from 'express';
import { VisitorsService } from '../services/visitors.service';
import { emitToRoles, RealtimeEvents } from '../realtime/events';
import { UserRole } from '../utils/enums';

const service = new VisitorsService();

const WATCHER_ROLES = [UserRole.Admin, UserRole.Committee, UserRole.Security];

export class VisitorsController {
  async getAll(req: Request, res: Response) {
    try {
      const { flatNumber } = req.query;
      const filter = flatNumber ? { flatNumber } : {};
      const data = await service.getAll(filter);
      res.json({ success: true, data }); // ✅ Wrapped
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const data = await service.getById(req.params.id);
      if (!data) return res.status(404).json({ success: false, message: 'Visitor not found' });
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const data = await service.create(req.body);
      await emitToRoles(WATCHER_ROLES, RealtimeEvents.VisitorAlert, data);
      res.status(201).json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async checkoutVisitor(req: Request, res: Response) {
    try {
      const data = await service.checkoutVisitor(req.params.id);
      if (!data) return res.status(404).json({ success: false, message: 'Visitor not found' });
      await emitToRoles(WATCHER_ROLES, RealtimeEvents.VisitorAlert, data);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const data = await service.update(req.params.id, req.body);
      if (!data) return res.status(404).json({ success: false, message: 'Visitor not found' });
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await service.delete(req.params.id);
      res.json({ success: true, message: 'Visitor deleted' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
