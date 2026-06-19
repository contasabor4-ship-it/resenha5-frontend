import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { searchParams } = new URL(req.url);
    const playerId = searchParams.get('playerId');

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 });
    }

    const { data: players } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('room_code', code)
      .order('created_at', { ascending: true });

    let assignment = null;
    let source = null;

    if (playerId && (room.current_phase === 'drawing' || room.current_phase === 'guessing')) {
      const { data: a } = await supabaseAdmin
        .from('assignments')
        .select('*')
        .eq('room_code', code)
        .eq('round_number', room.current_round)
        .eq('phase', room.current_phase)
        .eq('player_id', playerId)
        .maybeSingle();

      assignment = a;

      if (assignment) {
        if (room.current_phase === 'drawing') {
          const { data: s } = await supabaseAdmin
            .from('phrases')
            .select('*')
            .eq('id', assignment.source_id)
            .maybeSingle();
          source = s;
        } else if (room.current_phase === 'guessing') {
          const { data: s } = await supabaseAdmin
            .from('drawings')
            .select('*')
            .eq('id', assignment.source_id)
            .maybeSingle();
          source = s;
        }
      }
    }

    return NextResponse.json({ room, players: players || [], assignment, source });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
