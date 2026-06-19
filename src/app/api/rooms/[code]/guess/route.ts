import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { playerId, drawingId, text } = await req.json();

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('current_round')
      .eq('code', code)
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 });
    }

    const { error } = await supabaseAdmin.from('guesses').insert({
      room_code: code,
      round_number: room.current_round,
      drawing_id: drawingId,
      guesser_id: playerId,
      text: text.trim(),
    });

    if (error) {
      return NextResponse.json({ error: 'Erro ao salvar palpite' }, { status: 500 });
    }

    await supabaseAdmin
      .from('players')
      .update({ has_submitted: true })
      .eq('id', playerId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
