/**
 * REST API — Cloudflare Workers fetch() handler.
 *
 * No framework needed: Workers receive a Request and return a Response.
 * CORS is handled here (not in nginx) since api.frogop.net maps directly
 * to this Worker via Cloudflare custom domains.
 */
import type { Env } from '../types/index.js';
import {
    getAllPools, getPool, getOptionsByPool,
    getOption, getOptionsByWriter, getOptionsByBuyer, getOptionsByUser,
    getLastIndexedBlock,
} from '../db/queries.js';

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function getAllowedOrigin(origin: string | null): string {
    if (!origin) return '';
    if (origin === 'https://frogop.net') return origin;
    if (/^https:\/\/[^.]+\.pages\.dev$/.test(origin)) return origin;
    return '';
}

function withCors(response: Response, origin: string | null): Response {
    const allowed = getAllowedOrigin(origin);
    if (!allowed) return response;
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin',  allowed);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function notFound(msg = 'Not found'): Response {
    return json({ error: msg }, 404);
}

function badRequest(msg: string): Response {
    return json({ error: msg }, 400);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleFetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const url    = new URL(request.url);
    const path   = url.pathname.replace(/\/$/, '');   // strip trailing slash

    // Preflight
    if (request.method === 'OPTIONS') {
        const allowed = getAllowedOrigin(origin);
        if (!allowed) return new Response(null, { status: 403 });
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin':  allowed,
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age':       '86400',
                'Vary':                         'Origin',
            },
        });
    }

    if (request.method !== 'GET') {
        return withCors(json({ error: 'Method not allowed' }, 405), origin);
    }

    const resp = await route(path, url.searchParams, env);
    return withCors(resp, origin);
}

async function route(
    path: string,
    params: URLSearchParams,
    env: Env,
): Promise<Response> {

    // GET /health
    if (path === '/health') {
        const lastBlock = await getLastIndexedBlock(env.DB);
        return json({ status: 'ok', lastBlock, network: env.OPNET_NETWORK });
    }

    // GET /pools
    if (path === '/pools') {
        return json(await getAllPools(env.DB));
    }

    // GET /pools/:address
    const poolMatch = path.match(/^\/pools\/([^/]+)$/);
    if (poolMatch) {
        const pool = await getPool(env.DB, poolMatch[1] ?? '');
        return pool ? json(pool) : notFound('Pool not found');
    }

    // GET /pools/:address/options[?writer=&buyer=&status=&page=&limit=]
    const poolOptionsMatch = path.match(/^\/pools\/([^/]+)\/options$/);
    if (poolOptionsMatch) {
        return handlePoolOptions(poolOptionsMatch[1] ?? '', params, env.DB);
    }

    // GET /pools/:address/options/:id
    const singleOptionMatch = path.match(/^\/pools\/([^/]+)\/options\/(\d+)$/);
    if (singleOptionMatch) {
        const optionId = parseInt(singleOptionMatch[2] ?? '', 10);
        if (isNaN(optionId)) return badRequest('Invalid option ID');
        const option = await getOption(env.DB, singleOptionMatch[1] ?? '', optionId);
        return option ? json(option) : notFound('Option not found');
    }

    // GET /user/:address/options
    const userMatch = path.match(/^\/user\/([^/]+)\/options$/);
    if (userMatch) {
        const addr = userMatch[1] ?? '';
        if (!addr) return badRequest('Missing address');
        return json(await getOptionsByUser(env.DB, addr));
    }

    return notFound();
}

async function handlePoolOptions(
    poolAddress: string,
    params: URLSearchParams,
    db: D1Database,
): Promise<Response> {
    const writer = params.get('writer');
    const buyer  = params.get('buyer');
    const status = params.get('status');
    const page   = Math.max(0, parseInt(params.get('page') ?? '0', 10));
    const limit  = Math.min(200, Math.max(1, parseInt(params.get('limit') ?? '50', 10)));
    const offset = page * limit;

    if (writer) return json(await getOptionsByWriter(db, poolAddress, writer));
    if (buyer)  return json(await getOptionsByBuyer(db, poolAddress, buyer));

    const statusNum = status !== null ? parseInt(status, 10) : undefined;
    return json(await getOptionsByPool(db, poolAddress, { status: statusNum, limit, offset }));
}
