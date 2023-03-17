import { matches } from 'schemion';
import { api } from '../../api/apiQuery';
import type { Entry } from '../../controllers/entry';
import type { Label } from '../../controllers/label';
import type { Auth } from '../../controllers/user';
import type { Mutable, NotificationOptions } from '../../utils/types';

export async function importEntries (
    contents: string,
    labels: Label[],
    auth: Auth,
): Promise<undefined
           | Partial<NotificationOptions>
           | Partial<NotificationOptions>[]
> {
    const labelHashMap = new Map<string, string>();
    labels.forEach((label) => {
        labelHashMap.set(label.name, label.id);
    });

    let json: unknown = [];

    try {
        json = JSON.parse(contents) as unknown;
    } catch (e: unknown) {
        return {
            text: `File was not valid JSON`,
        };
    }

    if (!Array.isArray(json)) {
        return {
            text: `Incorrect JSON structure, expected array`,
        };
    }

    let errors: [ number, string ][] = [];
    let notifications: Partial<NotificationOptions>[] = [];

    let i = -1;
    for (let entryJSON of json) {
        i++;
        if (!matches(entryJSON, {
            entry: 'string',
            title: 'string',
            time: 'string',
            created: 'number',
            latitude: 'number',
            longitude: 'number',
            location: 'object',
            types: 'object',
            label: 'string',
        }, {
            time: '0',
            location: [],
            types: [],
            label: '',
        })) {
            errors.push([ i, `entry is not object` ]);
            continue;
        }

        const postBody: Mutable<Omit<Partial<Entry>, 'label'>> & {
            label?: string
        } = {};

        if (entryJSON.location && !Array.isArray(entryJSON.location)) {
            errors.push([ i, `location is not array` ]);
            continue;
        }

        postBody.entry = entryJSON.entry;
        postBody.title = entryJSON.title || '';
        postBody.created = parseInt(entryJSON.time) || entryJSON.created;
        postBody.latitude = parseFloat((entryJSON.latitude || entryJSON.location[0]) as string) || 0;
        postBody.longitude = parseFloat((entryJSON.longitude || entryJSON.location[1]) as string) || 0;

        if (entryJSON.types && Array.isArray(entryJSON.types) && entryJSON.types.length) {
            const name = entryJSON.types[0] as string;
            if (!labelHashMap.has(name)) {
                notifications.push({
                    text: `Creating label ${name}`,
                    type: 'info',
                    removeAfter: 10000,
                });
                const { err, val: createLabelRes } = await api.post(auth, `/labels`, {
                    name,
                    colour: '#000000',
                });
                if (err) {
                    errors.push([ i, `failed to create label ${name}` ]);
                    continue;
                }

                postBody.label = createLabelRes.id;
                labelHashMap.set(name, createLabelRes.id);
            } else {
                postBody.label = labelHashMap.get(name);
            }
        }
        postBody.label ||= entryJSON.label;

        const { err } = await api.post(auth, `/entries`, postBody);
        if (err) {
            errors.push([ i, err ]);
        }
    }

    if (errors.length < 0) {
        return {
            text: `Successfully uploaded entries`,
            type: 'success',
        };
    }

    for (let error of errors) {
        const text = '#' + error[0] + ': ' + error[1];
        console.error(text);
        notifications.push({ text });
    }

    return notifications;
}