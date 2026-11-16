import { NextResponse } from 'next/server';
import { listModels } from '@/lib/providers/registry';

export async function GET() {
  const models = listModels();
  return NextResponse.json({ models });
}
