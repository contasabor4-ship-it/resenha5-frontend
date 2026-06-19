import { NextRequest, NextResponse } from 'next/server';

const HNS_SERVER = process.env.NEXT_PUBLIC_HNS_SERVER_URL || 'http://localhost:3002';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nickname } = body;

    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      return NextResponse.json({ error: 'Nickname é obrigatório' }, { status: 400 });
    }

    const res = await fetch(`${HNS_SERVER}/create-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nickname.trim() }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Erro ao criar sala no servidor' }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Erro ao conectar ao servidor de jogo' }, { status: 500 });
  }
}
