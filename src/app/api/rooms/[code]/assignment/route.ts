import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { searchParams } = new URL(req.url);
    const phase = searchParams.get('phase');
    const playerId = searchParams.get('playerId');
    const round = searchParams.get('round');

    if (!phase || !playerId || !round) {
      return NextResponse.json({ error: 'Parâmetros faltando' }, { status: 400 });
    }

    const { data: allAssignments } = await supabaseAdmin
      .from('assignments')
      .select('*')
      .eq('room_code', code);

    const assignment = allAssignments?.find(
      (a) => a.round_number === parseInt(round) && a.phase === phase && a.player_id === playerId
    ) || null;

    if (!assignment) {
      return NextResponse.json({ assignment: null, source: null });
    }

    let source = null;
    if (phase === 'drawing') {
      const { data } = await supabaseAdmin
        .from('phrases')
        .select('*')
        .eq('id', assignment.source_id)
        .maybeSingle();
      source = data;
    } else if (phase === 'guessing') {
      const { data } = await supabaseAdmin
        .from('drawings')
        .select('*')
        .eq('id', assignment.source_id)
        .maybeSingle();
      source = data;
    }

    return NextResponse.json({ assignment, source });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
