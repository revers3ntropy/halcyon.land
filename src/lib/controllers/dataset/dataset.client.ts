import type { Dataset as _Dataset, ThirdPartyDatasetIds, DatasetColumnType } from './dataset';

export type Dataset = _Dataset;

namespace DatasetUtils {
    export const builtInTypes: DatasetColumnType[] = [
        {
            id: 'number',
            created: null,
            name: 'Number',
            unit: '',
            validate: (value: unknown) => typeof value === 'number',
            serialize: JSON.stringify,
            deserialize: JSON.parse
        },
        {
            id: 'weight_kg',
            created: null,
            name: 'Weight (KG)',
            unit: 'kg',
            validate: (value: unknown) => typeof value === 'number',
            serialize: JSON.stringify,
            deserialize: JSON.parse
        },
        {
            id: 'text',
            created: null,
            name: 'Text',
            unit: '',
            validate: (value: unknown) => typeof value === 'string',
            serialize: t => t as string,
            deserialize: t => t
        },
        {
            id: 'boolean',
            created: null,
            name: 'Boolean',
            unit: '',
            validate: (value: unknown) => typeof value === 'boolean',
            serialize: (value: unknown) => (value ? '1' : '0'),
            deserialize: (value: string) => value === '1'
        }
    ];

    type Preset = { columns: { name: string; type: string }[] };
    export const dataSetPresets = {
        Weight: {
            columns: [{ name: 'Weight', type: 'weight_kg' }]
        }
    } satisfies { [name: string]: Preset };

    export const thirdPartyDatasetIdsToNames: Record<ThirdPartyDatasetIds, string> = {
        githubCommits: 'GitHub Commits',
        githubLoC: 'GitHub LoC'
    };
}

export type DatasetPresetName = keyof typeof DatasetUtils.dataSetPresets;

export const Dataset = DatasetUtils;