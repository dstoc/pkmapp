import {test, expect as baseExpect} from '@playwright/test';
import {format, Plugin} from 'pretty-format';

export {test};

const plugins = new Set<Plugin>();
export const expect = baseExpect.extend({
  toMatchPretty(actual: unknown, expected: string = '') {
    const name = 'toMatchPretty';
    const actualPretty = format(actual, {plugins: [...plugins]});
    expected = normalize(expected);
    try {
      baseExpect(expected).toEqual(actualPretty);
    } catch (e: any) {
      return {
        ...e.matcherResult,
        name,
        message: () => e.matcherResult.message.replace('toEqual', name),
      };
    }
    return {
      pass: true,
    };
  },
});

export function pretty(value: unknown) {
  return format(value, {plugins: [...plugins]});
}

export function normalize(pretty: string) {
  // Remove any blank first/last lines.
  pretty = pretty.replace(/^ *\n|\n *$/g, '');
  // Calculate the minimum non-zero indent.
  const indent = Math.min(
    ...(pretty.match(/(?<=^|\n) +(?!^|\n)/g) ?? ['']).map(
      (match) => match.length,
    ),
  );
  // Remove the indent.
  return pretty.replace(new RegExp(`(?<=^|\n) {0,${indent}}`, 'g'), '');
}

export function addPrettySerializer(plugin: Plugin) {
  plugins.add(plugin);
}
