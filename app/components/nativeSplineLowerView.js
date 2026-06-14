import { Platform, UIManager, requireNativeComponent } from 'react-native';

/**
 * Єдиний виклик requireNativeComponent('SplineLowerView') у проєкті.
 * Повторна реєстрація з іншого файлу дає: "Tried to register two views with the same name".
 */
function splineLowerViewRegistered() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  if (typeof UIManager.hasViewManagerConfig === 'function') {
    return UIManager.hasViewManagerConfig('SplineLowerView');
  }
  return UIManager.getViewManagerConfig('SplineLowerView') != null;
}

export const hasSplineLowerView = splineLowerViewRegistered();

export const NativeSplineLowerView = hasSplineLowerView
  ? requireNativeComponent('SplineLowerView')
  : null;
