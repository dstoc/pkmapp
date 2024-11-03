const isMac = /Mac|iPhone/i.test(navigator.platform);
export function platformModifier(e: KeyboardEvent) {
  return isMac ? e.metaKey : e.ctrlKey;
}
