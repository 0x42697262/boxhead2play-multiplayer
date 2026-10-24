import { AppError, ErrorCode } from '../../text/errors.ts';
import { ASSET_REQUEST_TIMEOUT_MS, HTML_CONTENT_TYPE } from './tuning.ts';

const CONTENT_TYPE_HEADER = 'content-type';
const ABORT_ERROR_NAMES: readonly string[] = ['TimeoutError', 'AbortError'];

export function isHtmlFallback(contentType: string | null): boolean {
  return (contentType ?? '').trim().toLowerCase().startsWith(HTML_CONTENT_TYPE);
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && ABORT_ERROR_NAMES.includes(error.name);
}

export function assetFailure(url: string, error: unknown, otherwise: ErrorCode): AppError {
  if (error instanceof AppError) return error;
  if (isAbort(error)) return new AppError(ErrorCode.AssetTimedOut, url);
  return new AppError(otherwise, `${url}: ${String(error)}`);
}

export async function withTimeout<T>(work: Promise<T>, timeoutMs: number, describe: () => AppError): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(describe()), timeoutMs);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAsset(url: string, fetchImpl: typeof fetch = fetch, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(ASSET_REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw assetFailure(url, error, ErrorCode.AssetMissing);
  }
  if (!response.ok) throw new AppError(ErrorCode.AssetMissing, `${url}: HTTP ${response.status}`);
  if (isHtmlFallback(response.headers.get(CONTENT_TYPE_HEADER))) {
    throw new AppError(ErrorCode.AssetServedAsPage, url);
  }
  return response;
}

export async function fetchAssetBody<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  fetchImpl: typeof fetch = fetch,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchAsset(url, fetchImpl, init);
  try {
    return await read(response);
  } catch (error) {
    throw assetFailure(url, error, ErrorCode.AssetInvalid);
  }
}
