'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Room, Player, ChatMessage, Assignment, Phrase, Drawing } from '@/types';

export function useRoom(roomCode: string, playerId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null);
  const [assignedPhrase, setAssignedPhrase] = useState<Phrase | null>(null);
  const [assignedDrawing, setAssignedDrawing] = useState<Drawing | null>(null);
  const [loading, setLoading] = useState(true);

  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;

  const fetchState = useCallback(async () => {
    try {
      const pid = playerIdRef.current || localStorage.getItem('player_id');
      const url = pid
        ? `/api/rooms/${roomCode}/state?playerId=${pid}`
        : `/api/rooms/${roomCode}/state`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setRoom(data.room);
      setPlayers(data.players || []);
      const me = (data.players || []).find((p: Player) => p.id === playerIdRef.current);
      setMyPlayer(me || null);

      if (data.assignment && data.source) {
        setCurrentAssignment(data.assignment);
        if (data.room.current_phase === 'drawing') {
          setAssignedPhrase(data.source);
          setAssignedDrawing(null);
        } else if (data.room.current_phase === 'guessing') {
          setAssignedDrawing(data.source);
          setAssignedPhrase(null);
        }
      } else if (data.room.current_phase === 'lobby' || data.room.current_phase === 'writing' || data.room.current_phase === 'results') {
        setCurrentAssignment(null);
        setAssignedPhrase(null);
        setAssignedDrawing(null);
      }
    } catch (e) {
      console.error('Error fetching state:', e);
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  const fetchChat = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomCode}/chat`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setChatMessages(data.messages);
      }
    } catch {}
  }, [roomCode]);

  useEffect(() => {
    fetchState();
    fetchChat();

    const roomSub = supabase
      .channel(`room-state:${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `code=eq.${roomCode}`,
        },
        () => { fetchState(); }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_code=eq.${roomCode}`,
        },
        () => { fetchState(); }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      fetchState();
      fetchChat();
    }, 3000);

    return () => {
      supabase.removeChannel(roomSub);
      clearInterval(pollInterval);
    };
  }, [roomCode, fetchState, fetchChat]);

  async function sendMessage(text: string) {
    const pid = playerIdRef.current || localStorage.getItem('player_id');
    const pname = myPlayer?.name || localStorage.getItem('player_name');
    if (!pid || !pname) return;
    await fetch(`/api/rooms/${roomCode}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: pid, playerName: pname, message: text }),
    });
    fetchChat();
  }

  async function startGame() {
    if (!myPlayer?.is_host) return;
    await fetch(`/api/rooms/${roomCode}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, roomCode }),
    });
  }

  async function submitPhrase(text: string) {
    if (!myPlayer) return;
    await fetch(`/api/rooms/${roomCode}/phrase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, text }),
    });
  }

  async function submitDrawing(phraseId: string, imageData: string) {
    if (!myPlayer) return;
    await fetch(`/api/rooms/${roomCode}/drawing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, phraseId, imageData }),
    });
  }

  async function submitGuess(drawingId: string, text: string) {
    if (!myPlayer) return;
    await fetch(`/api/rooms/${roomCode}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: myPlayer.id, drawingId, text }),
    });
  }

  async function advancePhase(force: boolean = false) {
    try {
      const res = await fetch(`/api/rooms/${roomCode}/next-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.warn('advancePhase error:', data.error || data);
      }
    } catch (e) {
      console.warn('advancePhase fetch error:', e);
    }
  }

  return {
    room,
    players,
    myPlayer,
    chatMessages,
    currentAssignment,
    assignedPhrase,
    assignedDrawing,
    loading,
    setMyPlayer,
    sendMessage,
    startGame,
    submitPhrase,
    submitDrawing,
    submitGuess,
    advancePhase,
  };
}
