export function idle() {
  return new Promise<void>((resolve) => requestIdleCallback(() => resolve()));
}
export function timeout(ms: number) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), ms));
}
export function nextTask() {
  return timeout(0);
}
