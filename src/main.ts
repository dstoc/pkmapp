import './pkmapp.js';
import {html, render} from 'lit';
import {enforceSingleProcess, injectStyles} from './pkmapp.js';

onunhandledrejection = (e) => console.error(e.reason);
onerror = (event, _source, _lineno, _colno, error) =>
  console.error(event, error);

injectStyles();
await enforceSingleProcess();

render(html`<pkm-app></pkm-app>`, document.body);
