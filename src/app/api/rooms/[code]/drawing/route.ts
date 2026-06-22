import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { playerId, phraseId, imageData } = await req.json();

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('current_round')
      .eq('code', code)
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 });
    }

    const { data: existing } = await supabaseAdmin
      .from('drawings')
      .select('id')
      .eq('room_code', code)
      .eq('round_number', room.current_round)
      .eq('drawer_id', playerId)
      .maybeSingle();

    if (existing) {
      const { error: uErr } = await supabaseAdmin
        .from('drawings')
        .update({ image_url: imageData })
        .eq('id', existing.id);
      if (uErr) {
        return NextResponse.json({ error: 'Erro ao atualizar desenho' }, { status: 500 });
      }
    } else {
      const { error } = await supabaseAdmin.from('drawings').insert({
        room_code: code,
        round_number: room.current_round,
        phrase_id: phraseId,
        drawer_id: playerId,
        image_url: imageData,
      });

      if (error) {
        return NextResponse.json({ error: 'Erro ao salvar desenho' }, { status: 500 });
      }
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
