import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Share } from 'react-native';
import { Body, Button, Card, Field } from './ui';

/**
 * Share button. Phones use the system share sheet; browsers use Web Share
 * when available, otherwise copy the link. The link is always shown afterwards
 * so it can be copied by hand if the clipboard is blocked.
 */
export function useShare() {
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const share = async (title: string, url: string) => {
    setLink(url);
    const text = `Try "${title}" on KineticCoach`;
    if (Platform.OS !== 'web') {
      try {
        await Share.share({ message: `${text}: ${url}`, url });
      } catch {
        // dismissed
      }
      return;
    }
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: Navigator['share'] }) : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch {
        // dismissed or unsupported: fall through to copying
      }
    }
    try {
      await Clipboard.setStringAsync(url);
      setStatus('Link copied to clipboard. Anyone with it can import this.');
    } catch {
      setStatus('Copy this link and send it to anyone you want to share with:');
    }
  };

  const panel = link ? (
    <Card>
      <Body muted>{status ?? 'Share link:'}</Body>
      <Field value={link} editable={false} selectTextOnFocus accessibilityLabel="Share link" />
    </Card>
  ) : null;

  return { share, panel };
}

export function ShareButton({ onPress }: { onPress: () => void }) {
  return <Button title="Share" variant="secondary" onPress={onPress} />;
}
