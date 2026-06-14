import { useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


const WIDTH_SMALL = 375;
const WIDTH_MEDIUM = 414;
const WIDTH_LARGE = 600;

export function useResponsive() {
  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = dimensions?.width ?? 390;
  const height = dimensions?.height ?? 844;

  const isSmallPhone = width <= WIDTH_SMALL;
  const isMediumPhone = width > WIDTH_SMALL && width <= WIDTH_MEDIUM;
  const isLargePhone = width > WIDTH_MEDIUM && width <= WIDTH_LARGE;
  const isTablet = width > WIDTH_LARGE;
  const isShortScreen = height < 700;
  const isNarrow = width < 400;

  const horizontalPadding = isSmallPhone ? 16 : isNarrow ? 20 : isTablet ? 32 : 22;
  const contentMaxWidth = isTablet ? 480 : Math.min(Math.max(0, (width || 390) - horizontalPadding * 2), 400) || 400;
  const titleBlockWidth = Math.min(Math.max(0, (width || 390) - horizontalPadding * 2), 335) || 335;

  const topPadding = (Platform.OS === 'ios' ? insets.top + 24 : insets.top + 28);
  const bottomPadding = (Platform.OS === 'ios' ? insets.bottom + 20 : insets.bottom + 24);

  const scale = isTablet ? Math.min(width / 390, 1.3) : 1;
  const titleFontSize = Math.round(26 * scale);
  const subtitleFontSize = Math.round(14 * scale);
  const optionFontSize = Math.round(16 * scale);
  const hintFontSize = Math.round(14 * scale);
  const buttonFontSize = Math.round(16 * scale);

  return {
    width,
    height,
    insets,
    isSmallPhone,
    isMediumPhone,
    isLargePhone,
    isTablet,
    isShortScreen,
    isNarrow,
    horizontalPadding,
    contentMaxWidth,
    titleBlockWidth,
    topPadding,
    bottomPadding,
    scale,
    titleFontSize,
    subtitleFontSize,
    optionFontSize,
    hintFontSize,
    buttonFontSize,
  };
}
