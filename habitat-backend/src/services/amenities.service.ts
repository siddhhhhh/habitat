import AmenitiesModel, { IAmenities } from '../models/amenities.model';
import { CacheTags, getOrSet, invalidateTag } from '../cache';

const AMENITIES_LIST_KEY = 'amenities:list';
const AMENITIES_LIST_TTL = 60; // seconds — amenity inventory changes rarely.

export class AmenitiesService {
    async getAll(): Promise<IAmenities[]> {
        return getOrSet(
            AMENITIES_LIST_KEY,
            AMENITIES_LIST_TTL,
            () => AmenitiesModel.find().lean<IAmenities[]>(),
            [CacheTags.Amenities]
        );
    }

    async getById(id: string) {
        return AmenitiesModel.findById(id);
    }

    async create(data: Partial<IAmenities>) {
        const created = await AmenitiesModel.create(data);
        await invalidateTag(CacheTags.Amenities);
        return created;
    }

    async update(id: string, data: Partial<IAmenities>) {
        const updated = await AmenitiesModel.findByIdAndUpdate(id, data, { new: true });
        await invalidateTag(CacheTags.Amenities);
        return updated;
    }

    async delete(id: string) {
        const deleted = await AmenitiesModel.findByIdAndDelete(id);
        await invalidateTag(CacheTags.Amenities);
        return deleted;
    }
}
