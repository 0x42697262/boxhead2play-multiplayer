import { ASSET_FORMAT_VERSION, type Manifest } from '../../src/adapters/assets/schemas.ts';

export type CatalogPaths = Manifest['catalogs'];

export interface ManifestInputs {
  readonly source: Manifest['source'];
  readonly generator: string;
  readonly catalogs: CatalogPaths;
  readonly files: Manifest['files'];
}

export function buildManifest(inputs: ManifestInputs): Manifest {
  return {
    formatVersion: ASSET_FORMAT_VERSION,
    source: inputs.source,
    generator: inputs.generator,
    catalogs: inputs.catalogs,
    files: [...inputs.files].sort((first, second) => first.path.localeCompare(second.path)),
  };
}
