import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { generatePlayerColor } from '@/lib/game-logic';

export async function POST(req: Request) {
  try {
    const { roomCode, nickname, isHost, playerId } = await req.json();

    if (!nickname || !nickname.trim()) {
      return NextResponse.json({ error: 'Nickname é obrigatório' }, { status: 400 });
    }

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .eq('code', roomCode)
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 });
    }

    if (room.status !== 'waiting') {
      return NextResponse.json({ error: 'Jogo já iniciou' }, { status: 400 });
    }

    const { data: existingPlayers } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('room_code', roomCode)
      .eq('is_connected', true);

    if (existingPlayers && existingPlayers.length >= room.max_players) {
      return NextResponse.json({ error: 'Sala cheia' }, { status: 400 });
    }

    if (playerId) {
      const { data: existingPlayer } = await supabaseAdmin
        .from('players')
        .select('*')
        .eq('id', playerId)
        .eq('room_code', roomCode)
        .single();

      if (existingPlayer) {
        const { data: updated } = await supabaseAdmin
          .from('players')
          .update({ is_connected: true, name: nickname.trim() })
          .eq('id', playerId)
          .select()
          .single();

        return NextResponse.json({ player: updated || existingPlayer });
      }
    }

    const { data: hostPlayer } = await supabaseAdmin
      .from('players')
      .select('id')
      .eq('room_code', roomCode)
      .eq('is_host', true)
      .single();

    const isHostPlayer = isHost && !hostPlayer;

    const { data: newPlayer, error: insertError } = await supabaseAdmin
      .from('players')
      .insert({
        room_code: roomCode,
        name: nickname.trim(),
        is_host: !!isHostPlayer,
        color: generatePlayerColor(),
        is_connected: true,
        has_submitted: false,
        score: 0,
      })
      .select()
      .single();

    if (insertError || !newPlayer) {
      return NextResponse.json({ error: 'Erro ao criar jogador' }, { status: 500 });
    }

    if (isHostPlayer) {
      await supabaseAdmin
        .from('rooms')
        .update({ host_player_id: newPlayer.id })
        .eq('code', roomCode);
    }

    return NextResponse.json({ room, player: newPlayer });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
