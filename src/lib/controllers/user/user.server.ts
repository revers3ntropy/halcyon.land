import type { QueryFunc } from '$lib/db/mysql';
import { encryptionKeyFromPassword } from '$lib/security/authUtils.server';
import { Result } from '$lib/utils/result';
import { cryptoRandomStr } from '$lib/utils/text';
import { nowUtc } from '$lib/utils/time';
import { Asset } from '../asset/asset.server';
import { Backup } from '../backup/backup';
import { Entry } from '../entry/entry';
import { Event } from '../event/event';
import { Label } from '../label/label';
import { Settings } from '../settings/settings';
import { UUId } from '../uuid/uuid';
import type { Auth, User as _User } from './user';

export type User = _User;

namespace UserUtils {
    export async function authenticate(
        query: QueryFunc,
        username: string,
        key: string
    ): Promise<Result<User>> {
        const res = await query<{ id: string }[]>`
            SELECT id
            FROM users
            WHERE username = ${username}
              AND password = SHA2(CONCAT(${key}, salt), 256)
        `;
        if (res.length !== 1) {
            return Result.err('Invalid login');
        }
        return Result.ok({ id: res[0].id, username, key });
    }

    export async function userExistsWithUsername(
        query: QueryFunc,
        username: string
    ): Promise<boolean> {
        const res = await query<Record<string, number>[]>`
            SELECT 1
            FROM users
            WHERE username = ${username}
        `;
        return res.length === 1;
    }

    export async function newUserIsValid(
        query: QueryFunc,
        username: string,
        password: string
    ): Promise<Result> {
        if (username.length < 3) {
            return Result.err('Username must be at least 3 characters');
        }
        if (password.length < 8) {
            return Result.err('Password must be at least 8 characters');
        }

        if (username.length > 128) {
            return Result.err('Username must be less than 128 characters');
        }

        if (await userExistsWithUsername(query, username)) {
            return Result.err('Username already in use');
        }

        return Result.ok(null);
    }

    export async function create(
        query: QueryFunc,
        username: string,
        password: string
    ): Promise<Result<User>> {
        const { err } = await newUserIsValid(query, username, password);
        if (err) return Result.err(err);

        const salt = await generateSalt(query);
        const id = await UUId.generateUUId(query);

        await query`
            INSERT INTO users (id, username, password, salt, created)
            VALUES (${id},
                    ${username},
                    SHA2(${password + salt}, 256),
                    ${salt},
                    ${nowUtc()});
        `;

        return Result.ok({ id, username, key: password });
    }

    export async function purge(query: QueryFunc, auth: Auth): Promise<void> {
        await Label.purgeAll(query, auth);
        await Entry.purgeAll(query, auth);
        await Asset.purgeAll(query, auth);
        await Event.purgeAll(query, auth);
        await Settings.purgeAll(query, auth);

        await query`
            DELETE
            FROM users
            WHERE id = ${auth.id}
        `;
    }

    async function generateSalt(query: QueryFunc): Promise<string> {
        let salt = '';
        let existingSalts: { salt: string }[];
        do {
            salt = cryptoRandomStr(10);
            existingSalts = await query<{ salt: string }[]>`
                SELECT salt
                FROM users
                WHERE salt = ${salt}
            `;
        } while (existingSalts.length !== 0);

        return salt;
    }

    export async function changePassword(
        query: QueryFunc,
        auth: Auth,
        oldPassword: string,
        newPassword: string
    ): Promise<Result> {
        if (!oldPassword) return Result.err('Invalid password');

        if (newPassword.length < 5) {
            return Result.err('New password is too short');
        }

        const oldKey = encryptionKeyFromPassword(oldPassword);

        if (oldKey !== auth.key) {
            return Result.err('Current password is invalid');
        }

        if (oldPassword === newPassword) {
            return Result.err('New password is same as current password');
        }

        const newKey = encryptionKeyFromPassword(newPassword);

        const newAuth = {
            ...auth,
            key: newKey
        };

        const { val: backup, err: generateErr } = await Backup.generate(query, auth);
        if (generateErr) return Result.err(generateErr);

        const { err: encryptErr, val: encryptedBackup } = Backup.asEncryptedString(backup, auth);

        if (encryptErr) return Result.err(encryptErr);

        await query`
            UPDATE users
            SET password = SHA2(CONCAT(${newKey}, salt), 256)
            WHERE id = ${auth.id}
        `;

        const { err } = await Backup.restore(query, newAuth, encryptedBackup, auth.key);
        if (err) return Result.err(err);

        return await Settings.changeEncryptionKeyInDB(query, auth, newKey);
    }
}

export const User = UserUtils;