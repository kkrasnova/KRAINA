import { z } from 'zod';
const coord = z.number().finite().optional().nullable();
export const landmarkStoryRequestSchema = z.object({
    request_ref: z.string().trim().min(3).max(64),
    language: z.string().trim().min(2).max(12).optional().nullable(),
    user_id: z.string().uuid().optional().nullable(),
    user_email: z.string().trim().max(320).optional().nullable(),
    scan_latitude: coord,
    scan_longitude: coord,
    attached_latitude: coord,
    attached_longitude: coord,
    vision_hint_title: z.string().trim().max(500).optional().nullable(),
    has_photo: z.boolean().optional(),
});
//# sourceMappingURL=landmarkStoryRequest.schemas.js.map