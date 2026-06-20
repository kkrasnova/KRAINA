import { pool } from '../db/pool.js';
export async function recordPrivacyUserRequest(params) {
    await pool.query(`INSERT INTO privacy_user_requests (user_id, user_email, request_type, app_language)
     VALUES ($1::uuid, $2, $3, $4)`, [params.userId, params.userEmail, params.requestType, params.appLanguage]);
}
//# sourceMappingURL=privacyRequestService.js.map