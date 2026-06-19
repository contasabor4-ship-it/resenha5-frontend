import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

interface ChainLink {
  type: 'phrase' | 'drawing' | 'guess';
  playerName: string;
  playerColor: string;
  content: string;
}

interface PlayerChain {
  playerName: string;
  playerColor: string;
  originalPhrase: string;
  links: ChainLink[];
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;

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

    if (!players || players.length === 0) {
      return NextResponse.json({ chains: [] });
    }

    const playerMap = new Map(players.map(p => [p.id, p]));

    const { data: initialPhrases } = await supabaseAdmin
      .from('phrases')
      .select('*')
      .eq('room_code', code)
      .eq('is_initial', true)
      .order('created_at', { ascending: true });

    const { data: allDrawings } = await supabaseAdmin
      .from('drawings')
      .select('*')
      .eq('room_code', code);

    const { data: allGuesses } = await supabaseAdmin
      .from('guesses')
      .select('*')
      .eq('room_code', code);

    const { data: allPhrases } = await supabaseAdmin
      .from('phrases')
      .select('*')
      .eq('room_code', code);

    const chains: PlayerChain[] = [];

    for (const ip of (initialPhrases || [])) {
      const author = playerMap.get(ip.author_id);
      if (!author) continue;

      const links: ChainLink[] = [];
      let currentPhraseId = ip.id;

      for (let round = 1; round <= (room.total_rounds || 0); round++) {
        const drawing = (allDrawings || []).find(
          d => d.phrase_id === currentPhraseId && d.round_number === round
        );
        if (!drawing) break;

        const drawer = playerMap.get(drawing.drawer_id);
        links.push({
          type: 'drawing',
          playerName: drawer?.name || '?',
          playerColor: drawer?.color || '#999',
          content: drawing.image_url,
        });

        const guess = (allGuesses || []).find(
          g => g.drawing_id === drawing.id && g.round_number === round
        );
        if (!guess) break;

        const guesser = playerMap.get(guess.guesser_id);
        links.push({
          type: 'guess',
          playerName: guesser?.name || '?',
          playerColor: guesser?.color || '#999',
          content: guess.text,
        });

        const nextPhrase = (allPhrases || []).find(
          p => p.round_number === round + 1 && p.author_id === guess.guesser_id && !p.is_initial
        );
        if (!nextPhrase) break;

        currentPhraseId = nextPhrase.id;
      }

      chains.push({
        playerName: author.name,
        playerColor: author.color,
        originalPhrase: ip.text,
        links,
      });
    }

    return NextResponse.json({ chains });
  } catch (error) {
    console.error('Results error:', error);
    return NextResponse.json({ chains: [] });
  }
}
