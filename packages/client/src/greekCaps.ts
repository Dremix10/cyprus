import { useLayoutEffect } from 'react';
import { toGreekUpper } from '@cyprus/shared';
import { useLangStore } from './i18n.js';

const SKIP_TAGS = new Set(['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE']);

function shouldUppercase(el: HTMLElement): boolean {
  if (SKIP_TAGS.has(el.tagName)) return false;
  // Title-case card names keep their accents (Δράκος, Φοίνικας).
  if (el.closest('.special-name')) return false;
  return getComputedStyle(el).textTransform === 'uppercase';
}

function rewriteText(node: Text): void {
  const parent = node.parentElement;
  if (!parent || !shouldUppercase(parent)) return;
  const raw = node.nodeValue ?? '';
  const next = toGreekUpper(raw);
  // CSS uppercase keeps tonos (Κατάταξη → ΚΑΤΆΤΑΞΗ). Replace only when
  // stripping them changes the capitals, so Latin labels stay as authored.
  if (next !== raw.toUpperCase()) node.nodeValue = next;
}

/** Rewrite Greek inside CSS `text-transform: uppercase` so capitals drop tonos. */
export function applyGreekCaps(root: ParentNode): void {
  if (typeof document === 'undefined') return;
  if (root instanceof Text) {
    rewriteText(root);
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    rewriteText(node as Text);
    node = walker.nextNode();
  }
}

export function useGreekCaps(): void {
  const lang = useLangStore((s) => s.lang);
  useLayoutEffect(() => {
    applyGreekCaps(document.body);
    const obs = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target instanceof Text) {
          rewriteText(mutation.target);
          continue;
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Text) rewriteText(node);
          else if (node instanceof Element) applyGreekCaps(node);
        });
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    const onResize = () => applyGreekCaps(document.body);
    window.addEventListener('resize', onResize);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [lang]);
}
