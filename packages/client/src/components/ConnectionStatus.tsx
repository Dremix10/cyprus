import { useState, useEffect } from 'react';
import { socket } from '../socket.js';

export function ConnectionStatus() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  if (connected) return null;

  return (
    <div className="connection-banner">
      Reconnecting...
    </div>
  );
}
