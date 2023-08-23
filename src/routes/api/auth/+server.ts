import { invalidateCache } from '$lib/utils/cache.server';
import { GETParamIsTruthy } from '$lib/utils/GETArgs';
import { getUnwrappedReqBody } from '$lib/utils/requestBody.server';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { COOKIE_KEYS, maxAgeFromShouldRememberMe, sessionCookieOptions } from '$lib/constants';
import { apiRes404, apiResponse } from '$lib/utils/apiResponse.server';
import { User } from '$lib/controllers/user/user.server';
import { Auth } from '$lib/controllers/auth/auth.server';

export const GET = (async ({ url, cookies }) => {
    const key: string | null = url.searchParams.get('key');
    const username: string | null = url.searchParams.get('username');
    const rememberMe = GETParamIsTruthy(url.searchParams.get('rememberMe'));

    if (!key || !username) {
        throw error(401, 'Invalid login');
    }

    const { err, val: sessionId } = await Auth.Server.authenticateUserFromLogIn(
        username,
        key,
        maxAgeFromShouldRememberMe(rememberMe)
    );
    if (err) throw error(401, err);

    cookies.set(COOKIE_KEYS.sessionId, sessionId, sessionCookieOptions(rememberMe));

    return apiResponse(key, {
        username
    });
}) satisfies RequestHandler;

export const PUT = (async ({ request, cookies }) => {
    const auth = Auth.Server.getAuthFromCookies(cookies);
    invalidateCache(auth.id);

    const { newPassword, currentPassword } = await getUnwrappedReqBody(auth, request, {
        currentPassword: 'string',
        newPassword: 'string'
    });

    const { err } = await User.Server.changePassword(auth, currentPassword, newPassword);
    if (err) throw error(400, err);

    return apiResponse(auth, {});
}) satisfies RequestHandler;

export const DELETE = (({ cookies }) => {
    const auth = Auth.Server.getAuthFromCookies(cookies);
    invalidateCache(auth.id);

    cookies.delete(COOKIE_KEYS.sessionId, sessionCookieOptions(false));
    Auth.Server.invalidateAllSessionsForUser(auth.id);

    return apiResponse(null, {});
}) satisfies RequestHandler;

export const POST = apiRes404;
