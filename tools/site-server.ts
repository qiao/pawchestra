// The local server of a built site for the load measures: `pnpm load-probe` and `pnpm lighthouse`.
// It serves a folder such as `dist/` over HTTP/2 with TLS (and HTTP/1.1), and copies the answers
// of one host:
//
// - GitHub Pages (`pages`): gzip for the text types, ETag, and `Cache-Control: max-age=600`.
// - Vercel (`vercel`): brotli or gzip for the text types, ETag, the default
//   `Cache-Control: public, max-age=0, must-revalidate`, and the headers of the routes of
//   `vercel.json` for a browser request.
//
// The network of the server can delay each request and share one link rate among all bodies, so
// that the fetches of the Workers also get it (`--phone` of `pnpm load-probe`).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import { createSecureServer } from 'node:http2';
import type { Http2ServerRequest, Http2ServerResponse } from 'node:http2';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import { ROOT } from './ref-tree.ts';

/** The text types that the server compresses, as GitHub Pages and Vercel do. */
const TEXT_TYPES = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml']);

/** The content type of each file type of the site. */
const CONTENT_TYPES = new Map([
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.css', 'text/css'],
  ['.json', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain'],
  ['.xml', 'application/xml'],
  ['.wav', 'audio/wav'],
  ['.flac', 'audio/flac'],
  ['.mid', 'audio/midi'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

/** The network of a server: the delay of each request and the rate of the link. */
export interface Network {
  /** The delay of each request, in ms. */
  readonly latencyMs: number;
  /** The rate of the link for all requests together, in bytes per second, or `Infinity`. */
  readonly bytesPerSecond: number;
}

/**
 * Fast 4G of DevTools: 60 ms of round trip x 2.75 for each request, and 9 Mbit/s x 0.9 down for all
 * requests together.
 */
export const FAST_4G: Network = { latencyMs: 165, bytesPerSecond: (9e6 / 8) * 0.9 };

/** No delay and no limit of the rate. */
export const NO_LIMIT: Network = { latencyMs: 0, bytesPerSecond: Infinity };

/** The bytes that each body of the shaper gets in its turn. */
const LINK_TURN_BYTES = 4096;

/**
 * The brotli quality of Vercel. The brotli bodies of the live site have the sizes of quality 3,
 * within 0.1%, and the default quality 11 makes the 1.9 MB chunk `renderer` in about 3 s.
 */
const BROTLI_QUALITY = 3;

/** The host whose answers the server copies. */
type SiteHost = 'pages' | 'vercel';

/** The `Cache-Control` header of each file of GitHub Pages. */
const PAGES_CACHE = 'max-age=600';

/** The `Cache-Control` header of Vercel for a static file with no header rule. */
const VERCEL_CACHE = 'public, max-age=0, must-revalidate';

/** The part of `vercel.json` that the server reads. */
interface VercelConfig {
  /** The routes, in order. */
  readonly routes: readonly VercelRoute[];
}

/** A route of `vercel.json`, with the fields that the server reads. */
interface VercelRoute {
  /** The path pattern: a regular expression of the whole path. */
  readonly src?: string;
  /** The response headers of the route, by name. */
  readonly headers?: Readonly<Record<string, string>>;
  /** The conditions on the request, such as an `Accept` header that names `text/markdown`. */
  readonly has?: readonly { readonly type: string; readonly key: string }[];
  /** The start of a new phase of the routes, such as `filesystem`. */
  readonly handle?: string;
}

/** A header rule of `vercel.json`, with its source as a regular expression. */
interface HeaderRule {
  /** The pattern of the paths of the rule. */
  readonly pattern: RegExp;
  /** The headers, with their names in lower case. */
  readonly headers: readonly (readonly [string, string])[];
}

/**
 * Reads the header rules of `vercel.json` of the repository: the headers of each route before the
 * first `handle`. A route with conditions does not apply, because a browser request of the load
 * measures meets none of them (design 7.4).
 *
 * @returns The rules, in the order of the file.
 */
function vercelRules(): HeaderRule[] {
  // SAFETY: vercel.json of the repository follows the schema of Vercel.
  const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as VercelConfig;
  const end = config.routes.findIndex((route) => route.handle !== undefined);
  const routes = end === -1 ? config.routes : config.routes.slice(0, end);
  return routes.flatMap(({ src, headers, has }) =>
    src && headers && !has
      ? [
          {
            pattern: new RegExp(`^${src}$`, 'u'),
            headers: Object.entries(headers).map(
              ([key, value]) => [key.toLowerCase(), value] as const,
            ),
          },
        ]
      : [],
  );
}

/** A body that the shaper sends: the bytes that are left, and the functions of the response. */
interface LinkBody {
  /** The bytes that the shaper did not send yet. */
  rest: Buffer;
  /** Writes bytes into the response. */
  readonly write: (chunk: Buffer) => void;
  /** Ends the response. */
  readonly end: () => void;
}

/** A content coding of the server. */
type Coding = 'br' | 'gzip';

/** A file of the site with its compressed bytes and its ETag. */
interface SiteFile {
  /** The bytes of the file. */
  readonly body: Buffer;
  /** True for a text type, which the server compresses. */
  readonly text: boolean;
  /** The compressed bytes of each coding, made one time. */
  readonly coded: Map<Coding, Buffer>;
  /** The ETag: a part of the SHA-1 of the bytes. */
  readonly etag: string;
}

/**
 * The server of a site as its host serves it: HTTP/2 with TLS (or HTTP/1.1), the compression of the
 * text types, the `Cache-Control` headers of the host, and ETag. The server makes its network
 * itself, so that the fetches of the Workers also get it: each body gets a turn of
 * {@link LINK_TURN_BYTES} bytes, so that each body keeps the order of its own bytes.
 */
class SiteServer {
  /** The folder of the site. */
  readonly #root: string;
  /** The host whose answers the server copies. */
  readonly #host: SiteHost;
  /** The header rules of `vercel.json` for the host `vercel`, else none. */
  readonly #rules: readonly HeaderRule[];
  /** The latency of each request, in ms. */
  readonly #latencyMs: number;
  /** The rate of the link, in bytes per second, or `Infinity` with no limit. */
  readonly #bytesPerSecond: number;
  /** The files that the server read, by path. */
  readonly #files = new Map<string, SiteFile>();
  /** The open bodies of the shaper. */
  readonly #bodies: LinkBody[] = [];
  /** The bytes that the link can send now. */
  #budget = 0;
  /** The time of the last tick of the shaper, in ms. */
  #last = performance.now();
  /** The time of the last request of the page, in ms. */
  #pageAt = 0;
  /** The bytes that the server sent for each path since the last {@link SiteServer.reset}. */
  sent = new Map<string, number>();
  /** Each response since the last reset: the path, its start, its end, and its bytes. */
  timeline: [string, number, number, number][] = [];

  /**
   * Creates the server of a folder.
   *
   * @param root The folder of the site, such as `dist/`.
   * @param host The host whose answers the server copies.
   * @param network The delay of each request and the rate of the link.
   */
  constructor(root: string, host: SiteHost, network: Network) {
    this.#root = root;
    this.#host = host;
    this.#rules = host === 'vercel' ? vercelRules() : [];
    this.#latencyMs = network.latencyMs;
    this.#bytesPerSecond = network.bytesPerSecond;
  }

  /** Clears the bytes and the timeline for the next load. */
  reset(): void {
    this.sent = new Map();
    this.timeline = [];
  }

  /**
   * Gives each open body its share of the link (5 ms ticks).
   */
  tick(): void {
    const now = performance.now();
    this.#budget = Math.min(
      this.#budget + ((now - this.#last) / 1000) * this.#bytesPerSecond,
      this.#bytesPerSecond * 0.02,
    );
    this.#last = now;
    while (this.#bodies.length > 0 && this.#budget >= 1) {
      for (let i = 0; i < this.#bodies.length && this.#budget >= 1;) {
        const body = this.#bodies[i];
        if (!body) {
          break;
        }
        const take = Math.min(body.rest.length, LINK_TURN_BYTES, Math.floor(this.#budget));
        body.write(body.rest.subarray(0, take));
        body.rest = body.rest.subarray(take);
        this.#budget -= take;
        if (body.rest.length === 0) {
          this.#bodies.splice(i, 1);
          body.end();
        } else {
          i++;
        }
      }
    }
  }

  /**
   * Reads each text file of the site and makes its compressed bodies for the host, so that no
   * request waits for a compression. A compression in a request stops all other answers.
   */
  prepare(): void {
    const codings: readonly Coding[] = this.#host === 'vercel' ? ['br', 'gzip'] : ['gzip'];
    for (const name of readdirSync(this.#root, { recursive: true, encoding: 'utf8' })) {
      if (!TEXT_TYPES.has(extname(name))) {
        continue;
      }

      const entry = this.#file(`/${name}`);
      if (!entry) {
        continue;
      }
      for (const coding of codings) {
        codedBody(entry, coding);
      }
    }
  }

  /**
   * Reads a file of the site, with its ETag, one time.
   *
   * @param path The path of the URL.
   * @returns The file, or `null` when the site has no such file.
   */
  #file(path: string): SiteFile | null {
    let file = join(this.#root, normalize(decodeURIComponent(path)));
    if (!file.startsWith(this.#root)) {
      return null;
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = join(file, 'index.html');
    }
    if (!existsSync(file)) {
      return null;
    }

    let entry = this.#files.get(file);
    if (!entry) {
      const body = readFileSync(file);
      entry = {
        body,
        text: TEXT_TYPES.has(extname(file)),
        coded: new Map(),
        etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`,
      };
      this.#files.set(file, entry);
    }
    return entry;
  }

  /**
   * Gives the content coding of a file for a request. GitHub Pages sends gzip, and Vercel sends
   * brotli when the browser accepts it.
   *
   * @param entry The file.
   * @param accepted The header `Accept-Encoding` of the request.
   * @returns The coding, or `null` for the plain bytes.
   */
  #coding(entry: SiteFile, accepted: string): Coding | null {
    if (!entry.text) {
      return null;
    }
    if (this.#host === 'vercel' && accepted.includes('br')) {
      return 'br';
    }
    return accepted.includes('gzip') ? 'gzip' : null;
  }

  /**
   * Answers a request after the delay of the network.
   *
   * @param request The request.
   * @param response The response.
   */
  serve(request: Http2ServerRequest, response: Http2ServerResponse): void {
    const path = new URL(request.url ?? '/', 'https://localhost').pathname;
    const reply = (): void => {
      this.#reply(path, request.headers, response);
    };
    if (this.#latencyMs > 0) {
      setTimeout(reply, this.#latencyMs);
    } else {
      reply();
    }
  }

  /**
   * Sends a file, a 304 answer for a known ETag, or a 404 answer.
   *
   * @param path The path of the URL.
   * @param headers The headers of the request.
   * @param response The response.
   */
  #reply(path: string, headers: IncomingHttpHeaders, response: Http2ServerResponse): void {
    const entry = this.#file(path);
    if (!entry) {
      response.writeHead(404);
      response.end();
      return;
    }

    if (path === '/') {
      this.#pageAt = performance.now();
    }
    const filePath = path.endsWith('/') ? `${path}index.html` : path;
    const replyHeaders: OutgoingHttpHeaders = {
      'content-type': CONTENT_TYPES.get(extname(filePath)) ?? 'application/octet-stream',
      'cache-control': this.#host === 'vercel' ? VERCEL_CACHE : PAGES_CACHE,
      etag: entry.etag,
    };
    for (const rule of this.#rules) {
      if (rule.pattern.test(path)) {
        for (const [name, value] of rule.headers) {
          replyHeaders[name] = value;
        }
      }
    }
    if (headers['if-none-match'] === entry.etag) {
      response.writeHead(304, replyHeaders);
      response.end();
      return;
    }

    const coding = this.#coding(entry, String(headers['accept-encoding']));
    let body = entry.body;
    if (coding) {
      body = codedBody(entry, coding);
      replyHeaders['content-encoding'] = coding;
    }
    replyHeaders['content-length'] = String(body.length);
    response.writeHead(200, replyHeaders);
    this.sent.set(path, (this.sent.get(path) ?? 0) + body.length);
    const row: [string, number, number, number] = [
      path,
      Math.round(performance.now() - this.#pageAt),
      -1,
      body.length,
    ];
    this.timeline.push(row);
    response.on('finish', () => {
      row[2] = Math.round(performance.now() - this.#pageAt);
    });
    if (this.#bytesPerSecond === Infinity) {
      response.end(body);
      return;
    }

    this.#bodies.push({
      rest: body,
      write: (chunk) => {
        response.write(chunk);
      },
      end: () => {
        response.end();
      },
    });
  }
}

/**
 * Gives the compressed body of a file, and keeps it for the next request.
 *
 * @param entry The file.
 * @param coding The content coding.
 * @returns The compressed bytes: brotli at {@link BROTLI_QUALITY}, or gzip at its default level.
 */
function codedBody(entry: SiteFile, coding: Coding): Buffer {
  let body = entry.coded.get(coding);
  if (!body) {
    body =
      coding === 'br'
        ? brotliCompressSync(entry.body, {
            params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
          })
        : gzipSync(entry.body);
    entry.coded.set(coding, body);
  }
  return body;
}

/** The certificate of the server. */
interface Certificate {
  /** The private key, as PEM. */
  readonly key: Buffer;
  /** The certificate for `localhost`, as PEM. */
  readonly cert: Buffer;
  /** The base64 SHA-256 of the public key, for `--ignore-certificate-errors-spki-list`. */
  readonly spki: string;
}

/**
 * Gives the certificate of the server, and the SPKI hash of its key. Chrome trusts the key, so it
 * keeps an HTTP cache: with a certificate error, it keeps none, and a repeat visit loads each file
 * again.
 *
 * @returns The key, the certificate, and the hash.
 */
function certificate(): Certificate {
  const dir = join(ROOT, 'scratch', 'site-server-cert');
  const keyFile = join(dir, 'key.pem');
  const certFile = join(dir, 'cert.pem');
  if (!existsSync(certFile)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=localhost',
      '-days',
      '365',
      '-keyout',
      keyFile,
      '-out',
      certFile,
    ]);
  }

  const spki = execFileSync('sh', [
    '-c',
    `openssl x509 -in '${certFile}' -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`,
  ])
    .toString()
    .trim();
  return { key: readFileSync(keyFile), cert: readFileSync(certFile), spki };
}

/** A site server that listens on a port. */
export interface RunningSite {
  /** The server, with the bytes and the timeline of the last load. */
  readonly server: SiteServer;
  /**
   * The flag that makes Chrome trust the certificate of the server:
   * `--ignore-certificate-errors-spki-list=<hash>`.
   */
  readonly trustFlag: string;
  /** Stops the shaper and the listener. */
  readonly close: () => void;
}

/** The options of a site server. */
interface SiteOptions {
  /** The folder of the site, such as `dist/`. */
  readonly root: string;
  /** The host whose answers the server copies. */
  readonly host: SiteHost;
  /** The delay of each request and the rate of the link. */
  readonly network: Network;
  /** The port on `localhost`. */
  readonly port: number;
}

/**
 * Starts the server of a site on a port of `localhost`, with its shaper. The compressed bodies are
 * ready before the first request.
 *
 * @param options The options.
 * @returns The running site.
 */
export async function startSiteServer(options: SiteOptions): Promise<RunningSite> {
  const { root, host, network, port } = options;
  const server = new SiteServer(root, host, network);
  server.prepare();
  const linkTimer = setInterval(() => {
    server.tick();
  }, 5);
  const { key, cert, spki } = certificate();
  const listener = createSecureServer({ key, cert, allowHTTP1: true }, (request, response) => {
    server.serve(request, response);
  });
  await new Promise<void>((done) => listener.listen(port, done));
  return {
    server,
    trustFlag: `--ignore-certificate-errors-spki-list=${spki}`,
    close: () => {
      clearInterval(linkTimer);
      listener.close();
    },
  };
}
