// Node `events` polyfill — bare `import 'events'` інколи вирізає Metro, тоді `require('events')` = undefined.
import EventEmitter from 'events';

void EventEmitter;
void EventEmitter.EventEmitter;

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
