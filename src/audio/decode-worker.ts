import { sf3ToPcmSf2 } from './decode.ts';
import type { DecodeReply, DecodeRequest } from './decode-messages.ts';
import type { EngineBank } from './engine.ts';
import { fetchOk } from './fetch-ok.ts';
import { plainBytes } from './plain-bytes.ts';
import { readWithProgress } from './read-progress.ts';

/**
 * The shortest time between two progress replies for the bytes of a request, in milliseconds.
 * The end of each file always sends a reply.
 */
const BYTES_REPLY_MS = 100;

function reply(message: DecodeReply, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

async function fetchPcm(url: string, onBytes: (bytes: number) => void): Promise<ArrayBuffer> {
  const response = await fetchOk(url);
  // The progress counts the bytes that arrive: in the build, the bytes of the gzip file.
  return sf3ToPcmSf2(await plainBytes(await readWithProgress(response, onBytes)));
}

/**
 * Fetches and converts the presets of a request, and transfers the PCM buffers with no copy. The
 * Worker keeps no buffer: the synth keeps each bank for the session (design 6.3). The progress
 * replies count the files that are ready and the bytes that arrived. A failure gives a `failed`
 * reply.
 */
async function decode(request: DecodeRequest): Promise<void> {
  let done = 0;
  let bytes = 0;
  let repliedAt = 0;
  const sendProgress = (): void => {
    repliedAt = performance.now();
    reply({ type: 'progress', id: request.id, done, bytes });
  };
  const addBytes = (count: number): void => {
    bytes += count;
    if (performance.now() - repliedAt >= BYTES_REPLY_MS) {
      sendProgress();
    }
  };
  try {
    const banks = await Promise.all(
      request.urls.map(async (url): Promise<EngineBank> => {
        const data = await fetchPcm(url, addBytes);
        done += 1;
        sendProgress();
        return { id: url, data };
      }),
    );
    reply(
      { type: 'decoded', id: request.id, banks },
      banks.map((bank) => bank.data),
    );
  } catch (error) {
    reply({ type: 'failed', id: request.id, message: String(error) });
  }
}

self.addEventListener('message', (event: MessageEvent<DecodeRequest>) => {
  void decode(event.data);
});
