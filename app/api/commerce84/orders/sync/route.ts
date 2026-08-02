import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import {
  inspectCommerce84SyncConfiguration,
  synchroniseCommerce84Orders,
} from '@/lib/commerce84-orders'

export const runtime = 'nodejs'

function authorised(request: Request, expected: string): boolean {
  const supplied = request.headers.get('x-commerce84-api-key')?.trim() || ''
  if (!expected || !supplied) return false
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  )
}

export async function POST(request: Request) {
  const inspection = inspectCommerce84SyncConfiguration(process.env)
  if (!inspection.configured || !inspection.configuration) {
    return NextResponse.json(
      { error: 'Commerce84 order sync is not configured', problems: inspection.problems },
      { status: 503, headers: { 'cache-control': 'no-store' } }
    )
  }
  if (!authorised(request, inspection.configuration.apiSecret)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'cache-control': 'no-store' } }
    )
  }
  try {
    const result = await synchroniseCommerce84Orders(inspection.configuration)
    return NextResponse.json(result, {
      status: result.errors.length > 0 ? 502 : 200,
      headers: { 'cache-control': 'no-store' },
    })
  } catch (error) {
    console.error('Commerce84 order sync failed:', error)
    return NextResponse.json(
      { error: 'Commerce84 order sync failed' },
      { status: 502, headers: { 'cache-control': 'no-store' } }
    )
  }
}
