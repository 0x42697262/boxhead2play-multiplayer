import { spawn } from 'node:child_process';
import {
  FFDEC_DEOBFUSCATION_CONFIG,
  FFDEC_EXPORT_FORMATS,
  FFDEC_EXPORT_TYPES,
  FFDEC_JAVA_OPTIONS,
} from '../tuning.ts';

export const JAVA_COMMAND = 'java';
const OUTPUT_TAIL_CHARACTERS = 4000;

export class FfdecError extends Error {}

export interface Ffdec {
  run(args: readonly string[]): Promise<void>;
}

export function createFfdec(jarPath: string): Ffdec {
  return {
    run: (args) =>
      new Promise((resolve, reject) => {
        const child = spawn(JAVA_COMMAND, [...FFDEC_JAVA_OPTIONS, '-jar', jarPath, ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        const collect = (chunk: Buffer): void => {
          output = (output + chunk.toString('utf8')).slice(-OUTPUT_TAIL_CHARACTERS);
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.on('error', (error) => {
          reject(new FfdecError(`Could not start ${JAVA_COMMAND}: ${error.message}`));
        });
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new FfdecError(`FFDec ${args[0] ?? ''} exited with code ${code ?? 'null'}:\n${output}`));
        });
      }),
  };
}

export function swfToXml(ffdec: Ffdec, swfPath: string, xmlPath: string): Promise<void> {
  return ffdec.run(['-swf2xml', swfPath, xmlPath]);
}

export function exportResources(ffdec: Ffdec, swfPath: string, outDir: string): Promise<void> {
  return ffdec.run([
    '-config',
    FFDEC_DEOBFUSCATION_CONFIG,
    '-format',
    FFDEC_EXPORT_FORMATS,
    '-export',
    FFDEC_EXPORT_TYPES,
    outDir,
    swfPath,
  ]);
}

export function exportSpritePngs(ffdec: Ffdec, swfPath: string, outDir: string, spriteIds: readonly number[]): Promise<void> {
  return ffdec.run(['-format', 'sprite:png', '-selectid', spriteIds.join(','), '-export', 'sprite', outDir, swfPath]);
}
