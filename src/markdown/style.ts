import {css} from 'lit';

export const styles = [
  // Inline
  css`
    md-inline {
      display: block;
      outline: none;
      min-height: 1rlh;
    }
    md-inline:focus-within {
      white-space: pre;
    }
    md-inline:focus-within * {
      white-space: pre-wrap;
    }
    md-span a,
    md-span {
      visibility: visible;
      font-size: 16px;
    }
    md-span[formatting] {
      color: var(--md-accent-color);
    }
    md-span[type='backslash_escape']::first-letter {
      font-size: 0;
    }
    md-inline:not(:focus-within)
      :is(
        md-span[type='link_destination'],
        md-span[type='link_title'],
        md-span[type='code_span_delimiter'],
        md-span[type='emphasis_delimiter']
      ) {
      display: none;
    }
    md-inline:not(:focus-within)
      :is(
        md-span[type='inline_link'],
        md-span[type='image'],
        md-span[type='shortcut_link']
      ) {
      visibility: collapse;
      font-size: 0;
    }
    a,
    md-span[type='shortcut_link'],
    md-span[type='uri_autolink'],
    md-span[type='inline_link'] {
      color: blue;
      cursor: pointer;
      text-decoration: inherit;
    }
    md-span[type='emphasis'] {
      font-style: italic;
    }
    md-span[type='strong_emphasis'] {
      font-weight: bold;
    }
    md-span[type='strikethrough'] {
      text-decoration: line-through;
    }
    md-span[type='code_span'] {
      white-space: pre-wrap;
      font-family: monospace;
    }
  `,
  // Block
  css`
    md-block {
      display: block;
      margin-block-start: 0.25lh;
      margin-block-end: 0.25lh;
    }
    md-block[root] {
      margin-block: 0;
    }
    md-block[type='list-item'] {
      white-space: initial;
      margin-block: 0;
    }
    md-block[type='code-block'] md-inline {
      font-family: monospace;
      white-space: pre-wrap;
    }
    md-block[type='section'] > md-inline {
      font-weight: bold;
    }
    md-block[type='section'] {
      margin-block-end: 0.75lh;
      --md-section-gutter-color: initial;
      --md-section-nested-gutter: initial;
    }
    md-block[type='section'] > md-block[type='section'] {
      --md-section-nested-gutter: -18px;
    }
    md-block[type='section']:focus-within:not(
        :has(:is(md-block[type='section'], md-transclusion):focus-within)
      ) {
      --md-section-gutter-color: var(--md-active-block-color);
    }
    /* Reduce gap between block and list */
    md-block + md-block[type='list'] {
      margin-block-start: -0.25lh !important;
    }
    /* Remove gap between list item and nested list */
    md-block[type='list-item']
      > md-block[type='paragraph']
      + md-block[type='list'] {
      margin-block-start: -0.25lh !important;
    }
    /* Reduce gap between section title and first content */
    md-block[type='section'] > md-block:nth-child(2) {
      margin-block-start: 0.25lh !important;
    }
    /* No gap before the first nested block */
    md-block > md-block:first-child {
      margin-block-start: 0;
    }
    /* No gap after the last nested block */
    md-block > md-block:last-child {
      margin-block-end: 0;
    }
    md-inline[selected] {
      background: var(--md-block-selection-bgcolor);
      caret-color: transparent;
    }
    md-block:not(
        :has(md-inline:not([selected]), md-transclusion:not([selected]))
      ) {
      --md-accent-color: currentcolor;
      --md-active-block-color: var(--md-block-selection-bgcolor);
      --md-block-quote-bgcolor: var(--md-block-selection-bgcolor);
      --md-code-block-bgcolor: var(--md-block-selection-bgcolor);
      --md-code-span-bgcolor: var(--md-block-selection-bgcolor);
      --md-tag-bgcolor: var(--md-block-selection-bgcolor);
      --md-selection-override-bgcolor: var(--md-block-selection-bgcolor);
      --root-background-color: var(--md-block-selection-bgcolor);
      caret-color: transparent;
    }
    md-block {
      background-color: var(--md-selection-override-bgcolor);
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  // Overridable styles.
  css`
    md-span[type='code_span'] {
      font-family: var(--md-code-font-family);
      border-radius: 3px;
      padding: 3px;
      background: var(--md-code-span-bgcolor);
    }
    md-block[type='block-quote'] {
      background: var(--md-block-quote-bgcolor);
      border-left: 10px solid var(--md-accent-color);
      padding: 10px;
      padding-left: 20px;
      border-radius: 10px;
      background-clip: padding-box;
      border: var(--md-block-quote-border);
      background-image: linear-gradient(
        90deg,
        var(--md-accent-color) 0,
        var(--md-accent-color) 10px,
        transparent 10px
      );
    }
    md-block[type='code-block'] md-inline {
      font-family: var(--md-code-font-family);
      background: var(--md-code-block-bgcolor);
      padding: 10px;
      border-radius: 10px;
      background-clip: padding-box;
      border: var(--md-code-block-border);
    }
    a,
    md-span[type='shortcut_link'],
    md-span[type='uri_autolink'],
    md-span[type='inline_link'] {
      color: var(--md-accent-color);
    }
    md-span[type='shortcut_link'] a,
    md-span[type='uri_autolink'],
    md-span[type='inline_link'] a {
      color: var(--md-accent-color);
      text-decoration: none;
    }
    md-span[type='tag'] {
      border-radius: 3px;
      padding: 3px;
      background: var(--md-tag-bgcolor);
    }
    md-span[type$='link'] md-span[type='tag'] {
      border-radius: unset;
      padding: unset;
      background: unset;
    }
  `,
];
