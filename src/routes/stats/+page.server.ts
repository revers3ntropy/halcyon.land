import { error } from '@sveltejs/kit';
import { Entry } from '../../lib/controllers/entry';
import { query } from '../../lib/db/mysql';
import { getAuthFromCookies } from '../../lib/security/getAuthFromCookies';
import { splitText, wordCount as txtWordCount } from '../../lib/utils';
import type { PageServerLoad } from './$types';

function commonWordsFromText (txt: string): [ string, number ][] {
    const words: Record<string, number> = {};
    for (const word of splitText(txt)) {
        words[word] ??= 0;
        words[word]++;
    }
    const wordEntries = Object.entries(words);
    return wordEntries.sort(([ _, a ], [ _2, b ]) => b - a);
}

export const load: PageServerLoad = async ({ cookies }) => {
    const auth = await getAuthFromCookies(cookies);

    const { val: entries, err } = await Entry.getAll(query, auth, false);
    if (err) throw error(400, err);

    const entryText = entries.map((entry: Entry) => entry.entry);

    const wordCount = txtWordCount(entryText.join(' '));
    const charCount = entryText.join('').length;
    const commonWords = commonWordsFromText(entryText.join(' '));

    return {
        entries: entries.map((entry: Entry) => entry.json()),
        entryCount: entries.length,
        commonWords: commonWords.slice(0, 100),
        wordCount,
        charCount,
    };
};