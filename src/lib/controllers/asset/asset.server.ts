import { LIMITS } from '$lib/constants';
import { decrypt, encrypt } from '$lib/utils/encryption';
import { FileLogger } from '$lib/utils/log.server';
import { Result } from '$lib/utils/result';
import { fmtBytes } from '$lib/utils/text';
import { nowUtc } from '$lib/utils/time';
import type { ResultSetHeader } from 'mysql2';
import type { TimestampSecs } from '../../../types';
import { Asset as _Asset, type AssetMetadata } from './asset';
import { UId } from '$lib/controllers/uuid/uuid.server';
import type { Auth } from '$lib/controllers/auth/auth';
import { query } from '$lib/db/mysql.server';

const logger = new FileLogger('Asset');

namespace AssetServer {
    type Asset = _Asset;

    async function canCreateAssetWithNameAndContent(
        auth: Auth,
        contentsPlainText: string,
        fileNamePlainText: string
    ): Promise<string | true> {
        if (contentsPlainText.length > LIMITS.asset.contentLenMax)
            return `Too big (max ${fmtBytes(LIMITS.asset.contentLenMax)})`;

        if (fileNamePlainText.length < LIMITS.asset.nameLenMin) return `File name too short`;

        if (fileNamePlainText.length > LIMITS.asset.nameLenMax)
            return `File name too long (max ${LIMITS.asset.nameLenMax})`;

        const [{ count }] = await query<{ count: number }[]>`
            SELECT COUNT(*) as count
            FROM assets
            WHERE userId = ${auth.id}
        `;
        if (count >= LIMITS.asset.maxCount)
            return `Maximum number of assets (${LIMITS.asset.maxCount}) reached`;

        return true;
    }

    export async function create(
        auth: Auth,
        contentsPlainText: string,
        fileNamePlainText?: string,
        created?: TimestampSecs,
        publicId?: string
    ): Promise<Result<{ publicId: string; id: string }>> {
        publicId ??= await UId.generate();
        fileNamePlainText ??= `${publicId}`;

        const canCreate = await canCreateAssetWithNameAndContent(
            auth,
            contentsPlainText,
            fileNamePlainText
        );
        if (canCreate !== true) return Result.err(canCreate);

        const id = await UId.generate();

        const encryptedContents = encrypt(contentsPlainText, auth.key);
        const encryptedFileName = encrypt(fileNamePlainText, auth.key);

        await query`
            INSERT INTO assets (id, publicId, userId, created, fileName, content)
            VALUES (${id},
                    ${publicId},
                    ${auth.id},
                    ${created ?? nowUtc()},
                    ${encryptedFileName},
                    ${encryptedContents})
        `;

        return Result.ok({ publicId, id });
    }

    export async function fromPublicId(auth: Auth, publicId: string): Promise<Result<Asset>> {
        const res = await query<
            { id: string; publicId: string; content: string; created: number; fileName: string }[]
        >`
            SELECT id,
                   publicId,
                   content,
                   created,
                   fileName
            FROM assets
            WHERE publicId = ${publicId}
              AND userId = ${auth.id}
        `;
        if (res.length !== 1) {
            if (res.length !== 0) {
                await logger.error(
                    `Expected 1 asset with publicId ${publicId} but found ${res.length}`,
                    { publicId, userId: auth.id }
                );
            }
            return Result.err('Asset not found');
        }

        const [asset] = res;

        const decryptedContent = decrypt(asset.content, auth.key);
        if (!decryptedContent.ok) return decryptedContent.cast();

        const decryptedFileName = decrypt(asset.fileName, auth.key);
        if (!decryptedFileName.ok) return decryptedFileName.cast();

        return Result.ok({
            id: asset.id,
            publicId: asset.publicId,
            content: decryptedContent.val,
            fileName: decryptedFileName.val,
            created: asset.created
        });
    }

    export async function all(auth: Auth): Promise<Result<Asset[]>> {
        const res = await query<Asset[]>`
            SELECT id,
                   publicId,
                   content,
                   created,
                   fileName
            FROM assets
            WHERE userId = ${auth.id}
        `;

        return Result.collect(
            res.map(row => {
                const decryptedContent = decrypt(row.content, auth.key);
                if (!decryptedContent.ok) return decryptedContent.cast();

                const decryptedFileName = decrypt(row.fileName, auth.key);
                if (!decryptedFileName.ok) return decryptedFileName.cast();

                return Result.ok({
                    id: row.id,
                    publicId: row.publicId,
                    content: decryptedContent.val,
                    fileName: decryptedFileName.val,
                    created: row.created
                });
            })
        );
    }

    export async function pageOfMetaData(
        auth: Auth,
        offset: number,
        count: number
    ): Promise<Result<[AssetMetadata[], number]>> {
        if (count < 1) return Result.err('Count must be greater than 0');
        if (isNaN(count)) return Result.err('Count must be a number');
        if (offset < 0) return Result.err('Offset must be positive');
        if (isNaN(offset)) return Result.err('Offset must be a number');

        const res = await query<
            { id: string; publicId: string; created: number; fileName: string }[]
        >`
            SELECT id,
                   publicId,
                   created,
                   fileName
            FROM assets
            WHERE userId = ${auth.id}
            ORDER BY created DESC
            LIMIT ${count}
            OFFSET ${offset}
        `;

        const metadata = Result.collect(
            res.map((row): Result<AssetMetadata> => {
                const decryptedFileName = decrypt(row.fileName, auth.key);
                if (!decryptedFileName.ok) return decryptedFileName.cast();

                return Result.ok({
                    id: row.id,
                    publicId: row.publicId,
                    fileName: decryptedFileName.val,
                    created: row.created
                });
            })
        );
        if (!metadata.ok) return metadata.cast();

        const [assetCount] = await query<{ count: number }[]>`
            SELECT COUNT(*) as count
            FROM assets
            WHERE userId = ${auth.id}
        `;

        return Result.ok([metadata.val, assetCount.count]);
    }

    export async function purgeAll(auth: Auth): Promise<void> {
        await query`
            DELETE
            FROM assets
            WHERE userId = ${auth.id}
        `;
    }

    export async function purgeWithPublicId(auth: Auth, publicId: string): Promise<Result<null>> {
        const res = await query<ResultSetHeader>`
            DELETE
            FROM assets
            WHERE userId = ${auth.id}
              AND publicId = ${publicId}
        `;

        if (!res.affectedRows) {
            return Result.err('Asset not found');
        }
        return Result.ok(null);
    }
}

export const Asset = {
    ..._Asset,
    ...AssetServer
};
export type Asset = _Asset;
