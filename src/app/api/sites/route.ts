import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function GET() {
  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json({ sites: [], source: 'local' });
  }

  const { data, error } = await supabase
    .from('seo_sites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    sites: data.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      addedAt: s.created_at,
    })),
    source: 'supabase',
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, domain } = body as { name?: string; domain?: string };

  if (!name || !domain) {
    return NextResponse.json({ error: 'Missing name or domain' }, { status: 400 });
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json({
      site: {
        id: cleanDomain.replace(/\./g, '-'),
        name,
        domain: cleanDomain,
        addedAt: new Date().toISOString(),
      },
      source: 'local',
    });
  }

  const { data, error } = await supabase
    .from('seo_sites')
    .insert({ name, domain: cleanDomain })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    site: {
      id: data.id,
      name: data.name,
      domain: data.domain,
      addedAt: data.created_at,
    },
    source: 'supabase',
  });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  if (!isSupabaseConfigured() || !supabase) {
    return NextResponse.json({ deleted: true, source: 'local' });
  }

  const { error } = await supabase.from('seo_sites').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, source: 'supabase' });
}
