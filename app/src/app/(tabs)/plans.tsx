import { router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Body, Button, Card, H1, H2, Screen, useTheme } from '../../components/ui';
import { WEEKDAYS_SHORT } from '../../lib/calendar';
import { useStore } from '../../lib/store';
import { PLAN_TEMPLATES, type PlanTemplate } from '../../lib/templates';

export default function PlansScreen() {
  const { plans, schedule, workouts, ready, saveWorkouts, savePlan } = useStore();

  // Adds a fresh copy of a ready-made plan to this profile, then opens it to pick training days.
  const addTemplate = (tpl: PlanTemplate) => {
    const { plan, workouts: ws } = tpl.build();
    saveWorkouts(ws);
    savePlan(plan);
    router.push({ pathname: '/plan/[id]', params: { id: plan.id } });
  };
  const t = useTheme();

  return (
    <Screen>
      <FlatList
        data={plans}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <H1>Plans</H1>
            <Body muted>A plan is a set of workouts for each week. Pick one, choose your training days, and it fills your calendar.</Body>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button title="+ New plan" onPress={() => router.push({ pathname: '/plan-edit/[id]', params: { id: 'new' } })} />
              <Button title="Import" variant="secondary" onPress={() => router.push('/import')} />
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: 10, marginTop: 20 }}>
            <H2>Ready-made plans</H2>
            <Body muted style={{ fontSize: 13 }}>Adds your own copy, which you can edit freely.</Body>
            {PLAN_TEMPLATES.map((tpl) => {
              const have = plans.some((p) => p.name === tpl.name);
              return (
                <Card key={tpl.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <H2>{tpl.name}</H2>
                    <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>{tpl.daysPerWeek} DAYS/WEEK</Text>
                  </View>
                  <Body muted>{tpl.summary}</Body>
                  <Button
                    title={have ? 'Add another copy' : 'Add to my plans'}
                    variant={have ? 'secondary' : 'primary'}
                    onPress={() => addTemplate(tpl)}
                    style={{ alignSelf: 'flex-start' }}
                  />
                </Card>
              );
            })}
          </View>
        }
        ListEmptyComponent={
          ready ? (
            <Card>
              <H2>No plans yet</H2>
              <Body muted>Build one from your workouts, or import a plan someone shared with you.</Body>
            </Card>
          ) : undefined
        }
        renderItem={({ item }) => {
          const active = schedule?.planId === item.id;
          const names = item.workoutIds.map((id) => workouts.find((w) => w.id === id)?.name).filter(Boolean);
          return (
            <Pressable onPress={() => router.push({ pathname: '/plan/[id]', params: { id: item.id } })} accessibilityRole="link">
              <Card style={active ? { borderColor: t.primary, borderWidth: 2 } : undefined}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <H2>{item.name}</H2>
                  <Text style={{ color: t.primary, fontWeight: '800', fontSize: 12 }}>
                    {active ? 'ACTIVE' : `${item.workoutIds.length} DAYS/WEEK`}
                  </Text>
                </View>
                <Body muted numberOfLines={2}>{names.join(' · ') || 'No workouts yet'}</Body>
                {active && schedule ? (
                  <Body style={{ fontSize: 13 }}>Training on {schedule.days.map((d) => WEEKDAYS_SHORT[d]).join(', ')}</Body>
                ) : null}
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
