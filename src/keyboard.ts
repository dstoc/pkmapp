const isMac = /Mac|iPhone/i.test(navigator.platform);

export function normalizeKeys({
  key,
  shiftKey,
  ctrlKey,
  altKey,
  metaKey,
}: KeyboardEvent) {
  if (isMac) {
    if (altKey && !ctrlKey) {
      if (['ArrowLeft', 'ArrowRight', 'Backpace', 'Delete'].includes(key)) {
        altKey = false;
        ctrlKey = true;
      }
    } else if (metaKey && !ctrlKey) {
      if (key === 'ArrowLeft') {
        key = 'Home';
        metaKey = false;
      } else if (key === 'ArrowRight') {
        key = 'End';
        metaKey = false;
      } else {
        metaKey = true;
        ctrlKey = false;
      }
    }
  }
  return {
    key,
    ctrlKey,
    shiftKey,
    altKey,
    metaKey,
  };
}
