import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { pf } from './profileI18n';
import { brandFontSans, brandFontSansSemibold } from './brandFont';
import { routeRegionTitle } from './routePlanTitles';
import { onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';

export default function ProfileSavedRouteCard({
  item,
  language,
  isLight,
  accent,
  shell,
  navigation,
  style,
}) {
  const plan = item.routePlan;
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#F2F2EA';
  const textMuted = isLight ? '#5C5C5C' : '#A8A8A8';
  const cardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.07)';
  const cardBorder = isLight ? 'rgba(2, 18, 235, 0.12)' : 'rgba(255,255,255,0.12)';
  const metaBg = isLight ? 'rgba(2, 18, 235, 0.06)' : 'rgba(255,255,255,0.08)';

  const first = plan?.stops?.[0];
  const title = routeRegionTitle(language, plan);
  const nStops = plan?.stops?.length || 0;
  const km = plan?.totalKm != null && Number.isFinite(Number(plan.totalKm)) ? Number(plan.totalKm) : null;

  const thumb = first?.thumb;

  const onOpen = () => {
    navigation.navigate('RouteNavigation', {
      ...shell,
      routePlan: plan,
    });
  };

  const cardShadow = useMemo(
    () =>
      Platform.select({
        ios: isLight
          ? {
              shadowColor: '#0212EB',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.08,
              shadowRadius: 14,
            }
          : {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
            },
        android: { elevation: isLight ? 3 : 4 },
      }),
    [isLight],
  );

  if (!plan?.stops?.length || !first) return null;

  return (
    <View style={[styles.cardWrap, cardShadow, style]}>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <View style={styles.row}>
          {thumb ? (
            <Image source={thumb} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPh]}>
              <Ionicons name="map-outline" size={28} color={textMuted} />
            </View>
          )}
          <View style={styles.body}>
            <Text style={[styles.regionLine, { color: accent }, brandFontSansSemibold]} numberOfLines={1}>
              {plan.flag} {title}
            </Text>
            <Text style={[styles.routeTitle, { color: textMain }, brandFontSansSemibold]} numberOfLines={2}>
              {first.title}
            </Text>
            <View style={[styles.metaRow, { backgroundColor: metaBg }]}>
              <View style={styles.metaItem}>
                <Ionicons name="git-branch-outline" size={15} color={accent} />
                <Text style={[styles.metaTxt, { color: textMuted }, brandFontSans]}>
                  {pf(language, 'savedRoutesStops').replace('{n}', String(nStops))}
                </Text>
              </View>
              {km != null ? (
                <View style={styles.metaItem}>
                  <Ionicons name="navigate-outline" size={15} color={accent} />
                  <Text style={[styles.metaTxt, { color: textMuted }, brandFontSans]}>
                    {pf(language, 'savedRoutesKm').replace('{k}', String(km))}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <Pressable
          onPress={onOpen}
          android_ripple={ripple}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: accent },
            pressed && { opacity: 0.92 },
          ]}
        >
          <Text style={[styles.ctaText, { color: onAccentButtonText(isLight) }, brandFontSansSemibold]}>
            {pf(language, 'savedRoutesOpenCta')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    marginBottom: 14,
    borderRadius: 22,
  },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'stretch',
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  thumbPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    marginLeft: 14,
    minWidth: 0,
    justifyContent: 'center',
  },
  regionLine: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  routeTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 2,
  },
  metaTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
