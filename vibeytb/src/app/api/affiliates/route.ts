import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * GET /api/affiliates — List all affiliate links
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('affiliate_links')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ affiliates: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/affiliates — Create a new affiliate link
 * Body: { tool_name, affiliate_url, direct_url?, commission?, signup_url?, active? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool_name, affiliate_url, direct_url, commission, signup_url, active, notes } = body;

    if (!tool_name || !affiliate_url) {
      return NextResponse.json(
        { error: 'tool_name and affiliate_url are required' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('affiliate_links')
      .insert([{
        tool_name: tool_name.trim(),
        affiliate_url: affiliate_url.trim(),
        direct_url: (direct_url || '').trim(),
        commission: (commission || '').trim(),
        signup_url: (signup_url || '').trim(),
        active: active !== false,
        notes: (notes || '').trim(),
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Affiliate for "${tool_name}" already exists. Use PATCH to update.` },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({ affiliate: data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/affiliates — Update an existing affiliate link
 * Body: { id, ...fields_to_update }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Clean string fields
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      cleanUpdates[key] = typeof val === 'string' ? val.trim() : val;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('affiliate_links')
      .update(cleanUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ affiliate: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/affiliates — Delete an affiliate link
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('affiliate_links')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
