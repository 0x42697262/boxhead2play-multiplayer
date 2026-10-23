import { AppError, ErrorCode } from '../../text/errors.ts';
import { mapLimited } from './AssetLoader.ts';
import type { SymbolsCatalog } from './schemas.ts';
import { LoadPhase, PARALLEL_DOWNLOADS, type ProgressListener } from './tuning.ts';
import { catalogEntryUrl } from './urls.ts';

export type ImageDecoder = (url: string) => Promise<CanvasImageSource>;

export interface GraphicSource {
  image(svgPath: string): CanvasImageSource | undefined;
}

const SVG_ROOT = /<svg\b([^>]*)>/;
const ASPECT_ATTRIBUTE = /\spreserveAspectRatio="[^"]*"/;
const SVG_MIME = 'image/svg+xml';
const STRETCH = ' preserveAspectRatio="none"';

export function stretchToViewport(svg: string): string {
  return svg.replace(SVG_ROOT, (_match, attributes: string) => `<svg${attributes.replace(ASPECT_ATTRIBUTE, '')}${STRETCH}>`);
}

export const decodeBrowserImage: ImageDecoder = async (url) => {
  let objectUrl: string | undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    objectUrl = URL.createObjectURL(new Blob([stretchToViewport(await response.text())], { type: SVG_MIME }));
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return image;
  } catch (error) {
    throw new AppError(ErrorCode.AssetMissing, `${url}: ${String(error)}`);
  } finally {
    if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
  }
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
