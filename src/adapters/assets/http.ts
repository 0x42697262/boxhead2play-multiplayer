import { AppError, ErrorCode } from '../../text/errors.ts';
import { ASSET_REQUEST_TIMEOUT_MS, HTML_CONTENT_TYPE } from './tuning.ts';

const CONTENT_TYPE_HEADER = 'content-type';

export function isHtmlFallback(contentType: string | null): boolean {
  return (contentType ?? '').trim().toLowerCase().startsWith(HTML_CONTENT_TYPE);
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

export async function fetchAsset(url: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(ASSET_REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new AppError(ErrorCode.AssetMissing, `${url}: ${String(error)}`);
  }
  if (!response.ok) throw new AppError(ErrorCode.AssetMissing, `${url}: HTTP ${response.status}`);
  if (isHtmlFallback(response.headers.get(CONTENT_TYPE_HEADER))) {
    throw new AppError(ErrorCode.AssetServedAsPage, url);
  }
  return response;
}
