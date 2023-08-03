import { AssetControllerServer } from '$lib/controllers/asset/asset.server';
import { error } from '@sveltejs/kit';
import { query } from '$lib/db/mysql.server';
import { cachedPageRoute } from '$lib/utils/cache.server';
import type { PageServerLoad } from './$types';

export const load = cachedPageRoute(async auth => {
    const { err, val } = await AssetControllerServer.pageOfMetaData(query, auth, 0, 4);
    if (err) throw error(500, err);

    return { assets: val[0], assetCount: val[1] };
}) satisfies PageServerLoad;
