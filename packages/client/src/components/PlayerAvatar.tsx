const AVATAR_EMOJIS: Record<string, string> = {
  zeus: '\u26A1', athena: '\uD83E\uDD89', poseidon: '\uD83D\uDD31', apollo: '\u2600\uFE0F',
  artemis: '\uD83C\uDF19', hermes: '\uD83D\uDC5F', ares: '\u2694\uFE0F', hera: '\uD83D\uDC51',
  aphrodite: '\uD83C\uDF39', hephaestus: '\uD83D\uDD28', demeter: '\uD83C\uDF3E', dionysus: '\uD83C\uDF47',
};

interface PlayerAvatarProps {
  avatar: string;
  alt?: string;
  className?: string;
}

export function PlayerAvatar({ avatar, alt, className }: PlayerAvatarProps) {
  if (avatar.startsWith('/')) {
    return <img className={className} src={avatar} alt={alt ?? ''} />;
  }
  const emoji = AVATAR_EMOJIS[avatar] ?? avatar;
  return <span className={className} role="img" aria-label={alt}>{emoji}</span>;
}
