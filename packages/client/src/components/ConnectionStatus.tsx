import { useState, useEffect } from 'react';
import { socket } from '../socket.js';
import { useT } from '../i18n.js';

export function ConnectionStatus() {
  const [connected, setConnected] = useState(socket.connected);
  const [wasConnected, setWasConnected] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setWasConnected(true);
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const t = useT();

  // Only show banner if we were connected before and lost connection
  if (connected || !wasConnected) return null;

  return (
    <div className="connection-banner">
      {t('connection.reconnecting')}
    </div>
  );
}
