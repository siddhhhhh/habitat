import Notice, { INotice } from "../models/notice.model";
import { CacheTags, getOrSet, invalidateTag } from "../cache";

const NOTICES_LIST_KEY = "notices:list";
const NOTICES_LIST_TTL = 30; // shorter TTL — residents expect new notices fast.

export const createNotice = async (data: Partial<INotice>) => {
  const notice = new Notice(data);
  const saved = await notice.save();
  await invalidateTag(CacheTags.Notices);
  return saved;
};

export const getAllNotices = async () => {
  return getOrSet(
    NOTICES_LIST_KEY,
    NOTICES_LIST_TTL,
    () => Notice.find().sort({ createdAt: -1 }).lean<INotice[]>(),
    [CacheTags.Notices]
  );
};

export const getNoticeById = async (id: string) => {
  return await Notice.findById(id);
};

export const updateNotice = async (id: string, data: Partial<INotice>) => {
  const updated = await Notice.findByIdAndUpdate(id, data, { new: true });
  await invalidateTag(CacheTags.Notices);
  return updated;
};

export const deleteNotice = async (id: string) => {
  const deleted = await Notice.findByIdAndDelete(id);
  await invalidateTag(CacheTags.Notices);
  return deleted;
};
