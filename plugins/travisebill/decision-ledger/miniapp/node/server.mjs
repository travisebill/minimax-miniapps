// @ts-check

/**
 * Decision Ledger — Node entry.
 *
 * Serves the page on the surface path and keeps the ledger in the Host-owned data directory.
 * The Agent never runs here: the page drives it through the Host bridge, so this process only
 * stores, filters, and renders the ADR.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { buildAdr } from './adr.mjs';
import { createStore } from './store.mjs';

/** @typedef {import('./miniapp-api.js').MiniAppContext} MiniAppContext */
/** @typedef {import('./miniapp-api.js').MiniAppLifecycle} MiniAppLifecycle */

const SURFACE_PATH = '/ledger';
const BODY_LIMIT = 4 * 1024 * 1024;

/**
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

/**
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {string} code
 */
function sendError(response, status, code) {
  sendJson(response, status, { error: code });
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_body');
  return /** @type {Record<string, unknown>} */ (parsed);
}

/**
 * @param {MiniAppContext} context
 * @returns {Promise<MiniAppLifecycle>}
 */
export async function start(context) {
  const store = createStore(context);
  const clientRoot = join(context.pluginRoot, 'miniapp', 'client');
  const [page, stylesheet, script] = await Promise.all([
    readFile(join(clientRoot, 'index.html')),
    readFile(join(clientRoot, 'app.css')),
    readFile(join(clientRoot, 'app.js')),
  ]);

  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      context.logger.error('decision-ledger.request-failed', {
        code: /** @type {NodeJS.ErrnoException} */ (error).code ?? 'unknown',
      });
      if (!response.headersSent) sendError(response, 500, 'internal_error');
      else response.end();
    });
  });

  /**
   * @param {import('node:http').IncomingMessage} request
   * @param {import('node:http').ServerResponse} response
   */
  async function handle(request, response) {
    const url = new URL(request.url ?? '/', 'http://miniapp.local');
    const path = url.pathname;
    const method = request.method ?? 'GET';

    if (method === 'GET' && path === SURFACE_PATH) {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': page.length,
        'cache-control': 'no-store',
      });
      response.end(page);
      return;
    }

    if (method === 'GET' && path === '/assets/app.css') {
      response.writeHead(200, {
        'content-type': 'text/css; charset=utf-8',
        'content-length': stylesheet.length,
        'cache-control': 'no-store',
      });
      response.end(stylesheet);
      return;
    }

    if (method === 'GET' && path === '/assets/app.js') {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'content-length': script.length,
        'cache-control': 'no-store',
      });
      response.end(script);
      return;
    }

    if (method === 'GET' && path === '/assets/icon.png') {
      const icon = await readFile(join(context.pluginRoot, 'icon.png'));
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': icon.length,
        'cache-control': 'no-store',
      });
      response.end(icon);
      return;
    }

    if (method === 'GET' && path === '/api/state') {
      const decisions = await store.list();
      sendJson(response, 200, { decisions });
      return;
    }

    if (method === 'POST' && path === '/api/decisions') {
      const body = await readJsonBody(request);
      const decision = await store.create(body);
      sendJson(response, 201, { decision });
      return;
    }

    const decisionMatch = /^\/api\/decisions\/([^/]+)(\/adr)?$/.exec(path);
    if (decisionMatch) {
      const id = decodeURIComponent(decisionMatch[1]);
      const wantsAdr = Boolean(decisionMatch[2]);

      if (method === 'PATCH' && !wantsAdr) {
        const body = await readJsonBody(request);
        const decision = await store.update(id, body);
        if (!decision) {
          sendError(response, 404, 'not_found');
          return;
        }
        sendJson(response, 200, { decision });
        return;
      }

      if (method === 'DELETE' && !wantsAdr) {
        const removed = await store.remove(id);
        sendJson(response, removed ? 200 : 404, removed ? { removed: true } : { error: 'not_found' });
        return;
      }

      if (method === 'POST' && wantsAdr) {
        const decisions = await store.list();
        const index = decisions.findIndex((item) => item.id === id);
        if (index === -1) {
          sendError(response, 404, 'not_found');
          return;
        }
        const adr = buildAdr(decisions[index], index + 1);
        const decision = await store.update(id, { adr });
        sendJson(response, 200, { adr, decision });
        return;
      }
    }

    sendError(response, 404, 'not_found');
  }

  await listen(server, context.listen.host, context.listen.port);
  context.logger.info('decision-ledger.runtime.listening');

  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    context.signal.removeEventListener('abort', onAbort);
    await close(server);
  };
  const onAbort = () => {
    void dispose();
  };
  context.signal.addEventListener('abort', onAbort, { once: true });
  if (context.signal.aborted) await dispose();

  return { dispose };
}

/**
 * @param {import('node:http').Server} server
 * @param {string} host
 * @param {number} port
 */
function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

/**
 * @param {import('node:http').Server} server
 */
function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
