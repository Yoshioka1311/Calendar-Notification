import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useNutrition } from '@/contexts/NutritionContext';
import { useSettings } from '@/contexts/SettingsContext';
import { spacing } from '@/theme';
import type { NutritionMeal, NutritionProgressPoint, NutritionRange } from '@/types/nutrition';
import { aggregateYearlyProgress, dailyAssessment, dailyBalanceScore, nutritionDimensions } from '@/utils/nutrition';

export default function NutritionScreen() {
  const { theme } = useSettings();
  const {
    summary,
    meals,
    profile,
    progress,
    progressRange,
    loading,
    error,
    reload,
    setProgressRange,
  } = useNutrition();
  const dimensions = nutritionDimensions(summary, profile);
  const score = dailyBalanceScore(summary, profile);
  const remaining = profile.estimatedDailyCalories ? profile.estimatedDailyCalories - summary.calories : undefined;
  const visibleProgress = useMemo(
    () => progressRange === 'year' ? aggregateYearlyProgress(progress) : progress,
    [progress, progressRange],
  );

  return (
    <Screen
      title="Nutrition"
      subtitle="Estimated from confirmed meals"
      refreshing={loading}
      onRefresh={() => void reload()}>
      {error ? (
        <Card style={styles.notice}>
          <Text style={[styles.noticeTitle, { color: theme.colors.warning }]}>Sync paused</Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>{error}</Text>
        </Card>
      ) : null}

      <Card style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>TODAY</Text>
            <Text style={[styles.kcalText, { color: theme.colors.text }]}>
              {Math.round(summary.calories).toLocaleString()} / {profile.estimatedDailyCalories?.toLocaleString() ?? 'Set target'} kcal
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(tabs)/settings')}
            style={[styles.iconButton, { backgroundColor: theme.colors.primarySoft }]}>
            <SymbolView name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} tintColor={theme.colors.primary} size={22} />
          </Pressable>
        </View>
        <ProgressBar value={profile.estimatedDailyCalories ? summary.calories / profile.estimatedDailyCalories : 0} />
        <Text style={[styles.remaining, { color: remaining !== undefined && remaining < 0 ? theme.colors.warning : theme.colors.textMuted }]}>
          {remaining === undefined
            ? 'Add your profile to estimate a daily target.'
            : remaining >= 0
              ? `${Math.round(remaining).toLocaleString()} kcal remaining`
              : `${Math.round(Math.abs(remaining)).toLocaleString()} kcal over estimated target`}
        </Text>
        <View style={styles.macroGrid}>
          <Macro label="Protein" value={summary.proteinG} target={profile.targetProteinG} unit="g" />
          <Macro label="Carbs" value={summary.carbohydrateG} target={profile.targetCarbohydrateG} unit="g" />
          <Macro label="Fat" value={summary.fatG} target={profile.targetFatG} unit="g" />
        </View>
      </Card>

      <Card style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <View style={[styles.ring, { borderColor: score >= 70 ? theme.colors.success : score >= 40 ? theme.colors.warning : theme.colors.border }]}>
            <Text style={[styles.ringScore, { color: theme.colors.text }]}>{score}%</Text>
            <Text style={[styles.ringLabel, { color: theme.colors.textMuted }]}>Balance</Text>
          </View>
          <View style={styles.assessmentBox}>
            <Text style={[styles.balanceTitle, { color: theme.colors.text }]}>Daily Balance</Text>
            <Text style={[styles.assessment, { color: theme.colors.textMuted }]}>{dailyAssessment(summary, profile)}</Text>
          </View>
        </View>
        <View style={styles.dimensionList}>
          {dimensions.map((dimension) => (
            <View key={dimension.key} style={styles.dimensionRow}>
              <Text style={[styles.dimensionLabel, { color: theme.colors.text }]}>{dimension.label}</Text>
              <Text style={[styles.dimensionValue, { color: theme.colors.textMuted }]}>
                {dimension.target ? `${dimension.value} / ${dimension.target}${dimension.key === 'energy' ? ' kcal' : ' g'}` : `${dimension.value}`}
              </Text>
              <Text style={[styles.dimensionStatus, { color: dimension.status.includes('High') || dimension.status.includes('Low') ? theme.colors.warning : theme.colors.success }]}>
                {dimension.status}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle title="TODAY'S MEALS" count={meals.length} />
      {meals.length ? meals.map((meal) => <MealRow key={meal.id} meal={meal} />) : (
        <Card>
          <EmptyState
            title="No meals logged today"
            message="In LINE, type คำนวณแคล and send a food photo. The meal appears here after you confirm it."
          />
        </Card>
      )}

      <Card style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={[styles.balanceTitle, { color: theme.colors.text }]}>Progress</Text>
          <RangeTabs value={progressRange} onChange={(range) => void setProgressRange(range)} />
        </View>
        <ProgressBars points={visibleProgress} range={progressRange} />
      </Card>
    </Screen>
  );
}

function ProgressBar({ value }: { value: number }) {
  const { theme } = useSettings();
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as DimensionValue;
  return (
    <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceElevated }]}>
      <View style={[styles.progressFill, { width, backgroundColor: theme.colors.primary }]} />
    </View>
  );
}

function Macro({ label, value, target, unit }: { label: string; value: number; target?: number; unit: string }) {
  const { theme } = useSettings();
  return (
    <View style={[styles.macro, { backgroundColor: theme.colors.surfaceElevated }]}>
      <Text style={[styles.macroLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.macroValue, { color: theme.colors.text }]}>{Math.round(value)}{unit}</Text>
      <Text style={[styles.macroTarget, { color: theme.colors.textMuted }]}>{target ? `/ ${target}${unit}` : 'target off'}</Text>
    </View>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  const { theme } = useSettings();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{title}</Text>
      {count !== undefined ? <Text style={[styles.sectionCount, { color: theme.colors.textMuted }]}>{count}</Text> : null}
    </View>
  );
}

function MealRow({ meal }: { meal: NutritionMeal }) {
  const { theme } = useSettings();
  return (
    <Card style={styles.mealCard}>
      <View style={styles.mealHeader}>
        <View style={[styles.mealIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <SymbolView name={{ ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }} tintColor={theme.colors.primary} size={20} />
        </View>
        <View style={styles.mealCopy}>
          <Text style={[styles.mealTitle, { color: theme.colors.text }]}>{mealTypeLabel(meal.mealType)}</Text>
          <Text style={[styles.mealSubtitle, { color: theme.colors.textMuted }]}>
            {meal.items.map((item) => item.detectedName).slice(0, 3).join(', ') || 'Confirmed meal'}
          </Text>
        </View>
        <Text style={[styles.mealCalories, { color: theme.colors.text }]}>{Math.round(meal.totalCalories)} kcal</Text>
      </View>
      <Text style={[styles.estimateNote, { color: theme.colors.textMuted }]}>
        Estimated from image, then confirmed in LINE. Confidence {Math.round(meal.confidence * 100)}%.
      </Text>
    </Card>
  );
}

function RangeTabs({ value, onChange }: { value: NutritionRange; onChange: (range: NutritionRange) => void }) {
  const { theme } = useSettings();
  const options: NutritionRange[] = ['week', 'month', 'year'];
  return (
    <View style={[styles.rangeTabs, { backgroundColor: theme.colors.surfaceElevated }]}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[styles.rangeTab, selected && { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.rangeText, { color: selected ? (theme.dark ? '#141526' : '#FFFFFF') : theme.colors.textMuted }]}>
              {option[0]!.toUpperCase() + option.slice(1)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProgressBars({ points, range }: { points: NutritionProgressPoint[]; range: NutritionRange }) {
  const { theme } = useSettings();
  const maxCalories = Math.max(1, ...points.map((point) => point.calories), ...points.map((point) => point.targetCalories ?? 0));
  if (!points.length) {
    return <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>No progress data yet.</Text>;
  }
  return (
    <View style={styles.chart}>
      {points.slice(-12).map((point) => {
        const height = Math.max(3, Math.round((point.calories / maxCalories) * 92));
        return (
          <View key={point.date} style={styles.barItem}>
            <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceElevated }]}>
              <View style={[styles.barFill, { height, backgroundColor: theme.colors.primary }]} />
            </View>
            <Text numberOfLines={1} style={[styles.barLabel, { color: theme.colors.textMuted }]}>{barLabel(point.date, range)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function mealTypeLabel(value: NutritionMeal['mealType']): string {
  return {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
    unknown: 'Meal',
  }[value];
}

function barLabel(date: string, range: NutritionRange): string {
  if (range === 'year') return date.slice(5, 7);
  return date.slice(5).replace('-', '/');
}

const styles = StyleSheet.create({
  notice: { marginBottom: spacing.md },
  noticeTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  noticeText: { fontSize: 12, lineHeight: 18 },
  heroCard: { marginBottom: spacing.lg },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 6 },
  kcalText: { fontSize: 25, lineHeight: 31, fontWeight: '800' },
  iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 11, borderRadius: 999, overflow: 'hidden', marginTop: 16 },
  progressFill: { height: '100%', borderRadius: 999 },
  remaining: { fontSize: 12, lineHeight: 18, marginTop: 9, fontWeight: '600' },
  macroGrid: { flexDirection: 'row', gap: 8, marginTop: 16 },
  macro: { flex: 1, minHeight: 78, borderRadius: 14, padding: 10, justifyContent: 'center' },
  macroLabel: { fontSize: 10, fontWeight: '800', marginBottom: 6 },
  macroValue: { fontSize: 18, fontWeight: '800' },
  macroTarget: { fontSize: 10, marginTop: 2 },
  balanceCard: { marginBottom: spacing.lg },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ring: { width: 106, height: 106, borderRadius: 53, borderWidth: 9, alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontSize: 25, lineHeight: 30, fontWeight: '900' },
  ringLabel: { fontSize: 10, fontWeight: '800' },
  assessmentBox: { flex: 1 },
  balanceTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  assessment: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  dimensionList: { marginTop: 17, gap: 10 },
  dimensionRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dimensionLabel: { width: 70, fontSize: 12, fontWeight: '700' },
  dimensionValue: { flex: 1, fontSize: 11 },
  dimensionStatus: { width: 84, textAlign: 'right', fontSize: 11, fontWeight: '800' },
  sectionTitleRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 4 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  sectionCount: { fontSize: 11, fontWeight: '800' },
  mealCard: { marginBottom: 10 },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mealIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  mealCopy: { flex: 1 },
  mealTitle: { fontSize: 15, fontWeight: '800' },
  mealSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  mealCalories: { fontSize: 15, fontWeight: '800' },
  estimateNote: { fontSize: 10, lineHeight: 15, marginTop: 10 },
  progressCard: { marginTop: 8, marginBottom: 16 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  rangeTabs: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  rangeTab: { minWidth: 52, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  rangeText: { fontSize: 10, fontWeight: '800' },
  chart: { height: 128, flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  barItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  barTrack: { width: '100%', maxWidth: 26, height: 98, borderRadius: 10, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 10 },
  barLabel: { width: 34, textAlign: 'center', fontSize: 9, fontWeight: '700' },
});
