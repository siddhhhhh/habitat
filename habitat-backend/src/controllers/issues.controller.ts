// controllers/issues.controller.ts
import { Request, Response } from 'express';
import { IssuesService } from '../services/issues.service';
import { emitToRoles, emitToUser, RealtimeEvents } from '../realtime/events';
import { UserRole } from '../utils/enums';

const service = new IssuesService();

const STAFF_ROLES = [UserRole.Admin, UserRole.Committee];

const refId = (val: unknown): string | undefined => {
    if (!val) return undefined;
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null && '_id' in val) {
        return String((val as { _id: unknown })._id);
    }
    return undefined;
};

export class IssuesController {
    async getAll(req: Request, res: Response) {
        try {
            const data = await service.getAll();
            res.status(200).json({ data });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    async getById(req: Request, res: Response) {
        try {
            const data = await service.getById(req.params.id);
            if (!data) return res.status(404).json({ message: 'Issue not found' });
            res.status(200).json({ data });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    // ✅ FIXED: Automatically set reporter from JWT token
    async create(req: Request, res: Response) {
        try {
            // Extract userId from authenticated user (set by verifyAuth middleware)
            const userId = (req as any).user?.id || (req as any).user?._id;
            
            if (!userId) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'User not authenticated' 
                });
            }

            // ✅ Merge reporter with request body
            const issueData = {
                ...req.body,
                reporter: userId // Set reporter automatically from JWT
            };

            const data = await service.create(issueData);
            await emitToRoles(STAFF_ROLES, RealtimeEvents.IssueUpdated, data);
            res.status(201).json({ data });
        } catch (err: any) {
            console.error('Create issue error:', err);
            res.status(500).json({ message: err.message });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const data = await service.update(req.params.id, req.body);
            if (!data) return res.status(404).json({ message: 'Issue not found' });
            await emitToRoles(STAFF_ROLES, RealtimeEvents.IssueUpdated, data);
            const reporterId = refId(data.reporter);
            if (reporterId) await emitToUser(reporterId, RealtimeEvents.IssueUpdated, data);
            const technicianId = refId(data.technician);
            if (technicianId) await emitToUser(technicianId, RealtimeEvents.IssueUpdated, data);
            res.status(200).json({ data });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            await service.delete(req.params.id);
            res.status(200).json({ message: 'Issue deleted successfully' });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }
}
