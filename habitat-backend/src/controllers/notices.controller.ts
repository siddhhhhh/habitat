import { Request, Response } from "express";
import * as noticeService from "../services/notice.service";
import { emitNoticeCreated } from "../realtime/events";

export const createNotice = async (req: Request, res: Response) => {
  try {
    const { title, description, visibleFrom, visibleUntil, pinned, audience } = req.body;

    if (!title || !description || !visibleFrom || !visibleUntil || !audience)
      return res.status(400).json({ message: "Missing required fields" });

    const notice = await noticeService.createNotice({
      title,
      description,
      visibleFrom: new Date(visibleFrom),
      visibleUntil: new Date(visibleUntil),
      pinned: pinned || false,
      audience
    });

    await emitNoticeCreated(audience as string[], notice);

    res.status(201).json({ data: notice });
  } catch (err: any) {
    console.error("Error creating notice:", err);
    res.status(500).json({ message: err.message });
  }
};


export const getNotices = async (req: Request, res: Response) => {
  try {
    const notices = await noticeService.getAllNotices();
    res.status(200).json({ data: notices }); // wrap array in 'data'
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};


export const getNotice = async (req: Request, res: Response) => {
  try {
    const notice = await noticeService.getNoticeById(req.params.id);
    if (!notice) return res.status(404).json({ message: "Notice not found" });
    res.status(200).json(notice);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const updateNotice = async (req: Request, res: Response) => {
  try {
    const notice = await noticeService.updateNotice(req.params.id, req.body);
    res.status(200).json(notice);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteNotice = async (req: Request, res: Response) => {
  try {
    await noticeService.deleteNotice(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
