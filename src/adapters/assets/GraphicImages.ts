import { AppError, ErrorCode } from '../../text/errors.ts';
import { mapLimited } from './AssetLoader.ts';
import type { SymbolsCatalog } from './schemas.ts';
import { LoadPhase, PARALLEL_DOWNLOADS, type ProgressListener } from './tuning.ts';
import { catalogEntryUrl } from './urls.ts';

export type ImageDecoder = (url: string) => Promise<CanvasImageSource>;

export interface GraphicSource {
  image(svgPath: string): CanvasImageSource | undefined;
}

export const decodeBrowserImage: ImageDecoder = async (url) => {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
  } catch (error) {
    throw new AppError(ErrorCode.AssetMissing, `${url}: ${String(error)}`);
  }
  return image;
};

export function graphicPaths(symbols: SymbolsCatalog): string[] {
  const paths = new Set<string>();
  for (const shape of Object.values(symbols.shapes)) paths.add(shape.svg);
  for (const text of Object.values(symbols.texts)) paths.add(text.svg);
  for (const morph of Object.values(symbols.morphShapes)) {
    for (const ratio of Object.values(morph.ratios)) paths.add(ratio.svg);
  }
  return [...paths].sort();
}

export class GraphicImages implements GraphicSource {
  private readonly images = new Map<string, CanvasImageSource>();

  image(svgPath: string): CanvasImageSource | undefined {
    return this.images.get(svgPath);
  }

  get size(): number {
    return this.images.size;
  }

  async loadAll(
    symbols: SymbolsCatalog,
    location: { readonly baseUrl: string; readonly symbolsCatalogPath: string },
    decode: ImageDecoder,
    onProgress: ProgressListener = () => undefined,
  ): Promise<void> {
    const paths = graphicPaths(symbols);
    let loaded = 0;
    await mapLimited(paths, PARALLEL_DOWNLOADS, async (path) => {
      const image = await decode(catalogEntryUrl(location.baseUrl, location.symbolsCatalogPath, path));
      this.images.set(path, image);
      loaded++;
      onProgress({ phase: LoadPhase.Graphics, loaded, total: paths.length });
    });
  }
}
