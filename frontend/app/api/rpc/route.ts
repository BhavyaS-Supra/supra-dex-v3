import { NextRequest, NextResponse } from 'next/server';

// Proxies JSON-RPC calls to the Supra EVM node. The node is HTTP-only, so browsers on an HTTPS
// origin (e.g. Vercel) can't call it directly (mixed content); this route makes the call server-side.
const UPSTREAM_RPC_URL =
  process.env.SUPRA_EVM_RPC_UPSTREAM ||
  process.env.NEXT_PUBLIC_SUPRA_EVM_RPC_URL ||
  'http://91.134.205.161:27000/rpc/v1/eth/wallet_integration';

const MAX_BODY_BYTES = 1_000_000;
const TIMEOUT_MS = 15_000;

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  }

  try {
    const upstream = await fetch(UPSTREAM_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'RPC upstream unavailable' }, { status: 502 });
  }
}
