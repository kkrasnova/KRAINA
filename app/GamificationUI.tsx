import React from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

interface LevelUpNotificationProps {
  visible: boolean;
  level: number;
  title: string;
  badge: string;
  onAnimationEnd?: () => void;
}

/**
 * Компонент для анімованого сповіщення про рівень-ап
 */
export function LevelUpNotification({
  visible,
  level,
  title,
  badge,
  onAnimationEnd,
}: LevelUpNotificationProps) {
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: false,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: false,
          }),
        ]),
        Animated.delay(2500),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: false,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: false,
          }),
        ]),
      ]).start(() => {
        onAnimationEnd?.();
      });
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim, onAnimationEnd]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.badge}>{badge}</Text>
        <Text style={styles.levelText}>Рівень {level}</Text>
        <Text style={styles.titleText}>{title}</Text>
        <View style={styles.starContainer}>
          {Array.from({ length: level }).map((_, i) => (
            <Text key={i} style={styles.star}>
              ⭐
            </Text>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

interface AchievementCardProps {
  badge: string;
  title: string;
  description: string;
}

/**
 * Карточка для відображення розблокованого досягнення
 */
export function AchievementCard({ badge, title, description }: AchievementCardProps) {
  return (
    <View style={styles.achievementCard}>
      <Text style={styles.achievementBadge}>{badge}</Text>
      <View style={styles.achievementText}>
        <Text style={styles.achievementTitle}>{title}</Text>
        <Text style={styles.achievementDescription}>{description}</Text>
      </View>
    </View>
  );
}

interface ProgressBarProps {
  current: number;
  next: number;
  currentLevel: number;
  progress: number; // 0-100
}

/**
 * Прогрес-бар для відображення прогресу до наступного рівня
 */
export function LevelProgressBar({
  current,
  next,
  currentLevel,
  progress,
}: ProgressBarProps) {
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>
          Рівень {currentLevel}: {current}/{next} локацій
        </Text>
        <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${Math.min(100, progress)}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 1000,
  },
  content: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  badge: {
    fontSize: 64,
    marginBottom: 16,
  },
  levelText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 8,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  starContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  star: {
    fontSize: 24,
  },

  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  achievementBadge: {
    fontSize: 40,
    marginRight: 16,
  },
  achievementText: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  achievementDescription: {
    fontSize: 13,
    color: '#A8A8A8',
  },

  progressContainer: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: 13,
    color: '#FFD700',
    fontWeight: '700',
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 4,
  },
});
