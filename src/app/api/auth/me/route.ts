import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    const { nickname } = await req.json();
    if (!nickname) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('nickname')
      .eq('nickname', nickname)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Conta não encontrada' }, { status: 401 });
    }

    return NextResponse.json({ nickname: account.nickname });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
