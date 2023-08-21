import { BackupControllerServer } from '$lib/controllers/backup/backup.server';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { COOKIE_KEYS, maxAgeFromShouldRememberMe, sessionCookieOptions } from '$lib/constants';
import { query } from '$lib/db/mysql.server';
import { apiRes404, apiResponse } from '$lib/utils/apiResponse.server';
import { invalidateCache } from '$lib/utils/cache.server';
import { getUnwrappedReqBody } from '$lib/utils/requestBody.server';
import { UserControllerServer } from '$lib/controllers/user/user.server';
import { Auth } from '$lib/controllers/auth/auth.server';

export const POST = (async ({ request, cookies, locals: { auth } }) => {
    if (auth && auth.key) throw error(401, 'Invalid authentication');

    const body = await getUnwrappedReqBody(null, request, {
        username: 'string',
        encryptionKey: 'string'
    });

    const { err } = await UserControllerServer.create(query, body.username, body.encryptionKey);
    if (err) throw error(400, err);

    const { err: authErr, val: sessionId } = await Auth.Server.authenticateUserFromLogIn(
        body.username,
        body.encryptionKey,
        maxAgeFromShouldRememberMe(false)
    );
    if (authErr) throw error(401, authErr);

    cookies.set(COOKIE_KEYS.sessionId, sessionId, sessionCookieOptions(false));

    return apiResponse(body.encryptionKey, { sessionId });
}) satisfies RequestHandler;

export const DELETE = (async ({ cookies, request, locals: { auth } }) => {
    if (!auth) throw error(401, 'Invalid authentication');
    invalidateCache(auth.id);

    const body = await getUnwrappedReqBody(auth.key, request, {
        username: 'string',
        encryptionKey: 'string'
    });

    const { val: userIdFromLogIn, err: authErr } = await Auth.Server.userIdFromLogIn(
        body.username,
        body.encryptionKey
    );
    if (authErr) throw error(401, authErr);
    if (userIdFromLogIn !== auth.id) throw error(401, 'Invalid authentication');

    const { err, val: backup } = await BackupControllerServer.generate(query, auth);
    if (err) throw error(400, err);

    await UserControllerServer.purge(query, auth);

    cookies.delete(COOKIE_KEYS.sessionId, sessionCookieOptions(false));

    return apiResponse(null, {
        backup: JSON.stringify(backup)
    });
}) satisfies RequestHandler;

export const GET = apiRes404;
export const PUT = apiRes404;
