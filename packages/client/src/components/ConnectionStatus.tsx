import { useState, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { socket } from '../socket.js';
import { useT } from '../i18n.js';

export function ConnectionStatus() {
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const onConnect = () => setLost(false);
    // Leaving a room or signing in closes the socket on purpose ("io client disconnect").
    // That is not a dropped connection, so it gets no banner.
    const onDisconnect = (reason: Socket.DisconnectReason) => setLost(reason !== 'io client disconnect');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const t = useT();

  // Only show banner after a connection we had was lost
  if (!lost) return null;

  return (
    <div className="connection-banner">
      {t('connection.reconnecting')}
    </div>
  );
}
