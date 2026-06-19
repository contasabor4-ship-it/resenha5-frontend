import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    const { playerId, roomCode } = await req.json();

    const { data: player } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Jogador não encontrado' }, { status: 404 });
    }

    if (!player.is_host) {
      return NextResponse.json({ error: 'Apenas o host pode iniciar' }, { status: 403 });
    }

    const { data: players } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('room_code', roomCode)
      .eq('is_connected', true);

    const totalPlayers = players?.length || 0;

    if (totalPlayers < 2) {
      return NextResponse.json({ error: 'Precisa de pelo menos 2 jogadores' }, { status: 400 });
    }

    const totalRounds = totalPlayers;
    const writingDuration = 90;

    const phaseEndAt = new Date(Date.now() + writingDuration * 1000).toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('rooms')
      .update({
        status: 'playing',
        current_round: 0,
        total_rounds: totalRounds,
        current_phase: 'writing',
        phase_end_at: phaseEndAt,
        started_at: new Date().toISOString(),
      })
      .eq('code', roomCode);

    if (updateError) {
      return NextResponse.json({ error: 'Erro ao iniciar jogo' }, { status: 500 });
    }

    await supabaseAdmin
      .from('players')
      .update({ has_submitted: false })
      .eq('room_code', roomCode);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
