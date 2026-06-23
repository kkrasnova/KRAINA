import { HttpError } from '../errors/HttpError.js';
export async function verifyFacebookAccessToken(accessToken) {
    const token = String(accessToken || '').trim();
    if (!token)
        throw new HttpError(400, 'invalid_token');
    const url = 'https://graph.facebook.com/me?fields=id,name,email&access_token=' +
        encodeURIComponent(token);
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({})));
    if (!res.ok || data.error || !data.id) {
        throw new HttpError(400, 'invalid_token');
    }
    const facebookId = String(data.id);
    const name = String(data.name || '').trim() || 'Facebook User';
    const email = String(data.email || '').trim().toLowerCase();
    const placeholderEmail = `facebook_${facebookId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}@kraina.local`;
    return {
        facebookId,
        email: email || placeholderEmail,
        name,
    };
}
//# sourceMappingURL=facebookVerify.js.map