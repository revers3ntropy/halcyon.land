import { error } from '@sveltejs/kit';
import { Entry } from '../../../../../lib/controllers/entry';
import { Label } from '../../../../../lib/controllers/label';
import { query } from '../../../../../lib/db/mysql';
import { getAuthFromCookies } from '../../../../../lib/security/getAuthFromCookies';
import { apiResponse } from '../../../../../lib/utils/apiResponse';
import { getUnwrappedReqBody } from '../../../../../lib/utils/requestBody';
import type { RequestHandler } from './$types';

export const PUT = (async ({ request, params, cookies }) => {
    const auth = await getAuthFromCookies(cookies);

    if (!params.entryId) {
        throw error(400, 'invalid id');
    }

    const body = await getUnwrappedReqBody(request, {
        label: 'string',
    }, {
        label: '',
    });

    const { err: entryErr, val: entry } = await Entry.fromId(
        query, auth,
        params.entryId,
    );
    if (entryErr) throw error(400, entryErr);

    if (entry.label?.id === body.label || (!body.label && !entry.label)) {
        throw error(400, 'Entry already has that label');
    }

    if (body.label) {
        if (!await Label.userHasLabelWithId(query, auth, body.label)) {
            throw error(404, 'Label not found');
        }
    }

    const updateRes = await Entry.updateLabel(query, auth, entry, body.label);
    if (updateRes.err) {
        throw error(400, updateRes.err);
    }

    return apiResponse({});
}) satisfies RequestHandler;