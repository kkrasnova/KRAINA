import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';

/**
 * Горизонтальный свайп между вкладками входа / регистрации.
 * Влево → register, вправо → login.
 * Переключает сразу при достижении порога (не ждёт отпускания).
 * Вертикальные жесты уступают ScrollView / TextInput.
 */
export function useAuthTabSwipePanHandlers(activeTab, onChangeTab) {
  const tabRef = useRef(activeTab);
  const onChangeRef = useRef(onChangeTab);
  const switchedRef = useRef(false);
  tabRef.current = activeTab;
  onChangeRef.current = onChangeTab;

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          return ax > 18 && ax > ay * 1.75;
        },
        onMoveShouldSetPanResponderCapture: (_, g) => {
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          return ax > 24 && ax > ay * 2;
        },
        onPanResponderGrant: () => {
          switchedRef.current = false;
        },
        onPanResponderTerminationRequest: (_, g) => {
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          // Віддаємо жест, якщо рух став вертикальним (скрол форми).
          return ay > ax;
        },
        onPanResponderMove: (_, g) => {
          if (switchedRef.current) return;
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          if (ax < 36 || ax <= ay * 1.5) return;
          const vx = g.vx || 0;
          const tab = tabRef.current;
          if ((g.dx < -36 || vx < -0.45) && tab === 'login') {
            switchedRef.current = true;
            onChangeRef.current('register');
          } else if ((g.dx > 36 || vx > 0.45) && tab === 'register') {
            switchedRef.current = true;
            onChangeRef.current('login');
          }
        },
        onPanResponderRelease: (_, g) => {
          if (switchedRef.current) return;
          const ax = Math.abs(g.dx);
          const ay = Math.abs(g.dy);
          if (ax < 32 || ax <= ay * 1.4) return;
          const vx = g.vx || 0;
          const tab = tabRef.current;
          if ((g.dx < -32 || vx < -0.35) && tab === 'login') {
            onChangeRef.current('register');
          } else if ((g.dx > 32 || vx > 0.35) && tab === 'register') {
            onChangeRef.current('login');
          }
        },
      }).panHandlers,
    [],
  );
}
