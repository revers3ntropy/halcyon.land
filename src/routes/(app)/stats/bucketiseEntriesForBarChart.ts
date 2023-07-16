import { capitalise } from '$lib/utils/text';
import { dayUtcFromTimestamp, fmtUtc, nowUtc } from '$lib/utils/time';
import { type OsGroup, osGroupFromEntry, osGroups } from '$lib/utils/userAgent';
import moment from 'moment/moment';
import { Bucket, By, type EntryWithWordCount } from './helpers';

export interface ChartData {
    datasets: {
        data: number[];
        label: string;
        backgroundColor?: string | string[];
        borderWidth?: number;
        borderColor?: string | string[];
    }[];
    labels: string[];
}

const generateLabelsDayAndWeek = (start: TimestampSecs, buckets: string[]): string[] => {
    let year = parseInt(fmtUtc(start, 0, 'YYYY'));
    return buckets.map(bucket => {
        const bucketTime = parseInt(bucket);
        const thisYear = parseInt(fmtUtc(bucketTime, 0, 'YYYY'));
        if (thisYear !== year) {
            year = thisYear;
            return fmtUtc(bucketTime, 0, 'Do MMM YYYY');
        }
        return fmtUtc(bucketTime,0, 'Do MMM');
    });
};

const generateLabels: Record<
    Bucket,
    (start: TimestampSecs, buckets: string[], selectedBucket: Bucket) => string[]
> = {
    [Bucket.Hour]: (): string[] => {
        const today = moment().startOf('day').unix();
        return Array(24)
            .fill(0)
            .map((_, i) => {
                const hour = i % 24;
                const day = Math.floor(i / 24);
                const date = today + day * 24 * 60 * 60;
                return fmtUtc(date + hour * 60 * 60, 0, 'ha');
            });
    },
    [Bucket.Day]: generateLabelsDayAndWeek,
    [Bucket.Week]: generateLabelsDayAndWeek,
    [Bucket.Month]: (start: TimestampSecs, buckets: string[]): string[] => {
        let year = parseInt(fmtUtc(start, 0, 'YY'));
        return buckets.map((bucket, i) => {
            const bucketTime = parseInt(bucket);
            const thisYear = parseInt(fmtUtc(bucketTime, 0, 'YY'));
            if (thisYear !== year || i === 0) {
                year = thisYear;
                return fmtUtc(bucketTime, 0, `MMM 'YY`);
            }
            return fmtUtc(bucketTime, 0, 'MMM');
        });
    },
    [Bucket.Year]: (_start: TimestampSecs, buckets: string[]): string[] => {
        return buckets.map(k => fmtUtc(parseInt(k), 0, 'YYYY'));
    },
    [Bucket.OperatingSystem]: () => osGroups.map(capitalise)
};

function datasetFactoryForStandardBuckets(
    selectedBucket: Bucket
): (entries: EntryWithWordCount[], by: By) => Record<string | number, number> {
    function bucketSize(bucket: Bucket): Seconds {
        switch (bucket) {
            case Bucket.Year:
                return 60 * 60 * 24 * 365;
            case Bucket.Month:
                return 60 * 60 * 24 * 30;
            case Bucket.Week:
                return 60 * 60 * 24 * 7;
            case Bucket.Day:
                return 60 * 60 * 24;
        }
        throw new Error(`Invalid bucket ${bucket}`);
    }

    function bucketiseTime(time: Seconds, bucket: Bucket): Seconds {
        const date = moment(new Date(time * 1000));
        switch (bucket) {
            case Bucket.Year:
                return date.startOf('year').unix();
            case Bucket.Month:
                return date.startOf('month').unix();
            case Bucket.Week:
                return date.startOf('week').unix();
            case Bucket.Day:
                return dayUtcFromTimestamp(time, 0);
        }
        throw new Error(`Invalid bucket ${time} ${bucket}`);
    }

    return (sortedEntries: EntryWithWordCount[], by: By): Record<string | number, number> => {
        const start = sortedEntries[0].created + sortedEntries[0].createdTZOffset * 60 * 60;

        const buckets: Record<string, number> = {};
        const end = nowUtc() + bucketSize(selectedBucket);

        let bucket = bucketiseTime(start, selectedBucket);
        while (bucket < end) {
            buckets[bucketiseTime(bucket, selectedBucket).toString()] = 0;
            bucket += bucketSize(selectedBucket);
        }

        for (const entry of sortedEntries) {
            const bucket = bucketiseTime(entry.created, selectedBucket).toString();
            buckets[bucket] += by === By.Entries ? 1 : entry.wordCount;
        }

        if (isNaN(Object.values(buckets).reduce((a, b) => a + b, 0))) {
            console.error(buckets);
            console.error('NaN in buckets');
        }

        const lastBucket = Object.keys(buckets)
            .map(a => parseInt(a))
            .sort((a, b) => a - b)
            .pop();
        if (lastBucket && buckets[lastBucket.toString()] === 0) {
            delete buckets[lastBucket.toString()];
        }

        return buckets;
    };
}

const generateDataset: Record<
    Bucket,
    (entries: EntryWithWordCount[], by: By) => Record<string | number, number>
> = {
    [Bucket.Hour]: (
        sortedEntries: EntryWithWordCount[],
        by: By
    ): Record<string | number, number> => {
        // Entries at 3pm on different days go in the same bucket

        const buckets = Array<number>(24).fill(0);

        for (const entry of sortedEntries) {
            const bucket = parseInt(fmtUtc(entry.created, entry.createdTZOffset, 'H'));
            buckets[bucket] += by === By.Entries ? 1 : entry.wordCount;
        }

        return buckets as Record<number, number>;
    },
    [Bucket.Day]: datasetFactoryForStandardBuckets(Bucket.Day),
    [Bucket.Week]: datasetFactoryForStandardBuckets(Bucket.Week),
    [Bucket.Month]: datasetFactoryForStandardBuckets(Bucket.Month),
    [Bucket.Year]: datasetFactoryForStandardBuckets(Bucket.Year),
    [Bucket.OperatingSystem]: (
        sortedEntries: EntryWithWordCount[],
        by: By
    ): Record<string | number, number> => {
        // Entries at 3pm on different days go in the same bucket

        const buckets = osGroups.reduce(
            (acc, group) => {
                acc[group] = 0;
                return acc;
            },
            {} as Record<OsGroup, number>
        );

        for (const entry of sortedEntries) {
            const bucket = osGroupFromEntry(entry);
            buckets[bucket] += by === By.Entries ? 1 : entry.wordCount;
        }

        return buckets;
    }
};

export function getGraphData(
    entries: EntryWithWordCount[],
    selectedBucket: Bucket,
    by: By
): ChartData {
    const sortedEntries = entries.sort((a, b) => a.created - b.created);
    const start = sortedEntries[0].created;

    const bucketsMap = generateDataset[selectedBucket](sortedEntries, by);
    const labels = generateLabels[selectedBucket](start, Object.keys(bucketsMap), selectedBucket);
    return {
        labels,
        datasets: [
            {
                data: Object.values(bucketsMap),
                label: by === By.Entries ? 'Entries' : 'Words',
                backgroundColor: 'rgba(189, 176, 255, 0.7)'
            }
        ]
    };
}
