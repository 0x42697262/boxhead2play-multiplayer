import { FFDEC_VERSION } from './tuning.ts';

export const SetupMessage = {
  upToDate: 'Game assets are up to date.',
  extracting: (reason: string) => `Extracting game assets from the SWF (${reason}). This takes about 20 seconds…`,
  downloadingFfdec: `Downloading JPEXS FFDec ${FFDEC_VERSION} (about 22 MB, once)…`,
  extracted: 'Game assets extracted.',
  javaMissing: (minimum: number) =>
    `Java ${minimum} or newer is required once, to extract the game assets with FFDec, and "java" was not found on PATH. ` +
    'Install a Java runtime (for example "sudo apt install default-jre", "sudo pacman -S jre-openjdk", "brew install openjdk" or https://adoptium.net) and run the command again.',
  javaTooOld: (minimum: number, found: number | undefined) =>
    `Java ${minimum} or newer is required to extract the game assets, but "java -version" reported ${found ?? 'an unknown version'}.`,
  ffdecDownloadFailed: (url: string, detail: string) => `Could not download FFDec from ${url}: ${detail}. Set FFDEC_JAR to a local ffdec.jar to skip the download.`,
  ffdecChecksumMismatch: (expected: string, actual: string) => `The FFDec download has SHA-256 ${actual}, expected ${expected}. Refusing to run it.`,
  ffdecArchiveUnsafe: (name: string) => `The FFDec archive contains an unsafe path: ${name}`,
  ffdecJarMissing: (jar: string) => `The FFDec archive did not contain ${jar}.`,
  swfMissing: (swfPath: string) => `The original game file is missing: ${swfPath}.`,
  extractFailed: (code: number | null) => `Asset extraction failed (exit code ${code ?? 'unknown'}). See the log above.`,
} as const;
