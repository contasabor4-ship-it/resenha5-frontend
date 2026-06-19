import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('*')
    .eq('code', code)
    .single();

  const { data: players } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('room_code', code);

  const { data: assignments } = await supabaseAdmin
    .from('assignments')
    .select('*')
    .eq('room_code', code);

  const { data: phrases } = await supabaseAdmin
    .from('phrases')
    .select('*')
    .eq('room_code', code);

  const { data: drawings } = await supabaseAdmin
    .from('drawings')
    .select('*')
    .eq('room_code', code);

  const { data: guesses } = await supabaseAdmin
    .from('guesses')
    .select('*')
    .eq('room_code', code);

  return NextResponse.json({
    room,
    players,
    assignments,
    phrases,
    drawings,
    guesses,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
