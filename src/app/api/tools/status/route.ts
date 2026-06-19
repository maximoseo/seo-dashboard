import { NextResponse } from 'next/server';
import { toolEnvMap, isToolConfigured } from '@/lib/tool-keys';

export async function GET() {
  const status: Record<string, boolean> = {};
  for (const toolId of Object.keys(toolEnvMap)) {
    status[toolId] = isToolConfigured(toolId);
  }
  return NextResponse.json({ status });
}
