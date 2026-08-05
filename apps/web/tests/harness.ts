import axe from 'axe-core';

export async function seriousAccessibilityViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => violation.id);
}

export function measureSync<T>(operation: () => T): { value: T; durationMs: number } {
  const start = performance.now();
  const value = operation();
  return { value, durationMs: performance.now() - start };
}

export function assertKeyboardReachable(element: HTMLElement): void {
  const tag = element.tagName.toLowerCase();
  const tabIndex = element.getAttribute('tabindex');
  const nativeControl = ['button', 'input', 'select', 'textarea', 'a'].includes(tag);
  if (!nativeControl && tabIndex === null) {
    throw new Error(`Expected ${tag} to be keyboard reachable`);
  }
}
