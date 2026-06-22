'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Lobby from '../../components/cs/Lobby';
import { createCSNetworkClient, CSNetworkClient } from '../../lib/cs/network/client';

const CS_SERVER_URL = process.env.NEXT_PUBLIC_CS_SERVER_URL || process.env.NEXT_PUBLIC_GAME_SERVER_URL || '';

export default function CSPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('r5_nickname');
    if (!saved) {
      router.push('/');
    } else {
      setNickname(saved);
      setLoading(false);
    }
  }, []);

  const handleCreateRoom = useCallback((team: 'CT' | 'T') => {
    const net = createCSNetworkClient();
    net.connect(CS_SERVER_URL, nickname);
    net.onRoomCreated((data) => {
      localStorage.setItem('cs_room_code', data.code);
      localStorage.setItem('cs_team', team);
      net.disconnect();
      router.push('/cs/game');
    });
    net.onError((msg) => {
      alert(msg);
      net.disconnect();
    });
    setTimeout(() => net.createRoom(team), 500);
  }, [nickname]);

  const handleJoinRoom = useCallback((code: string, team: 'CT' | 'T') => {
    localStorage.setItem('cs_room_code', code);
    localStorage.setItem('cs_team', team);
    router.push('/cs/game');
  }, []);

  const handleBack = useCallback(() => {
    router.push('/');
  }, []);

  if (loading) return null;

  return (
    <Lobby
      nickname={nickname}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onBack={handleBack}
    />
  );
}
