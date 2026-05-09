import { Request, Response } from 'express';
import { BillsService } from '../services/bills.service';
const service = new BillsService();

export class BillsController {
  // ✅ FIX: Wrap response in consistent format
  async getAll(_req: Request, res: Response) {
    try {
      const { userId, status } = _req.query;
      const data = await service.getAll({ 
        userId: userId as string, 
        status: status as string 
      });
      res.json({ success: true, data }); // ✅ Consistent wrapper
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Failed to fetch bills' });
    }
  }

  async getById(_req: Request, res: Response) {
    try {
      const data = await service.getById(_req.params.id);
      if (!data) return res.status(404).json({ success: false, message: 'Bill not found' });
      res.json({ success: true, data }); // ✅ Wrapped
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async create(_req: Request, res: Response) {
    try {
      const data = await service.create(_req.body);
      res.status(201).json({ success: true, data }); // ✅ Wrapped
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async update(_req: Request, res: Response) {
    try {
      const data = await service.update(_req.params.id, _req.body);
      if (!data) return res.status(404).json({ success: false, message: 'Bill not found' });
      res.json({ success: true, data }); // ✅ Wrapped
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async delete(_req: Request, res: Response) {
    try {
      await service.delete(_req.params.id);
      res.json({ success: true, message: 'Bill deleted' }); // ✅ Changed from 204
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async payBill(_req: Request, res: Response) {
    try {
      const { amount, gatewayRef } = _req.body;
      const data = await service.payBillManual(_req.params.id, amount, gatewayRef);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async generateBills(_req: Request, res: Response) {
    try {
      const billsData = _req.body;
      const data = await service.generateBills(billsData);
      res.status(201).json({ success: true, data }); // ✅ Wrapped
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}
