// Node `events` polyfill — bare `import 'events'` інколи вирізає Metro, тоді `require('events')` = undefined.
import EventEmitter from 'events';

void EventEmitter;
void EventEmitter.EventEmitter;

import { enableFreeze } from 'react-native-screens';
import { registerRootComponent } from 'expo';
import App from './App';

// Замораживает экраны вне фокуса (react-freeze): они перестают ре-рендериться,
// пока не активны. Делает переключение страниц плавнее по всему приложению.
enableFreeze(true);

registerRootComponent(App);
