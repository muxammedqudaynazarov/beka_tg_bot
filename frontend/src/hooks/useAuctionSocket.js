import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../api';

let sharedSocket = null;
function getSocket() {
  if (!sharedSocket) sharedSocket = io(API_BASE_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
  return sharedSocket;
}

/**
 * Berilgan auksion ID'sini kuzatib turadi va yangi taklif yoki yopilish
 * hodisalarida callback'larni chaqiradi. Auksion tafsilot sahifasi shu hook
 * orqali real-vaqtda narx/g'olib/vaqt yangilanishlarini oladi.
 */
export function useAuctionSocket(auctionId, { onUpdate, onClosed } = {}) {
  const handlersRef = useRef({ onUpdate, onClosed });
  handlersRef.current = { onUpdate, onClosed };

  useEffect(() => {
    if (!auctionId) return;
    const socket = getSocket();
    socket.emit('auction:join', auctionId);

    const updateHandler = (payload) => {
      if (payload.auctionId === auctionId) handlersRef.current.onUpdate?.(payload);
    };
    const closedHandler = (payload) => {
      if (payload.auctionId === auctionId) handlersRef.current.onClosed?.(payload);
    };

    socket.on('auction:update', updateHandler);
    socket.on('auction:closed', closedHandler);

    return () => {
      socket.emit('auction:leave', auctionId);
      socket.off('auction:update', updateHandler);
      socket.off('auction:closed', closedHandler);
    };
  }, [auctionId]);
}
