import { mapLimited } from './AssetLoader.ts';
import type { FontIndex } from './schemas.ts';
import { FONT_FAMILY_PREFIX, LoadPhase, PARALLEL_DOWNLOADS, type ProgressListener } from './tuning.ts';
import type { AssetLocator } from './urls.ts';

export function fontFamily(fontId: number): string {
  return `${FONT_FAMILY_PREFIX}${fontId}`;
}

export async function loadFonts(
  fonts: FontIndex,
  location: { readonly locator: AssetLocator; readonly fontsCatalogPath: string },
  onProgress: ProgressListener = () => undefined,
): Promise<void> {
  const entries = Object.entries(fonts.fonts);
  let loaded = 0;
  await mapLimited(entries, PARALLEL_DOWNLOADS, async ([fontId, font]) => {
    const url = location.locator.entryUrl(location.fontsCatalogPath, font.file);
    const face = new FontFace(fontFamily(Number(fontId)), `url(${url})`);
    document.fonts.add(await face.load());
    loaded++;
    onProgress({ phase: LoadPhase.Fonts, loaded, total: entries.length });
  });
}
