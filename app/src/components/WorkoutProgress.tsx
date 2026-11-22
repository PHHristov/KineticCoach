import { ScrollView, Text, View } from 'react-native';
import { describeSet, type Step } from '../lib/plan';
import type { WorkoutItem } from '../lib/types';

type WorkStep = Extract<Step, { kind: 'work' }>;

export type ProgressInfo = {
  /** Every exercise in the workout, in order, with its set steps. */
  exercises: { item: WorkoutItem; itemIndex: number; sets: { stepIndex: number; setNumber: number }[] }[];
  /** Exercise the user is doing now, or is resting/getting ready for. */
  currentItemIndex: number;
  /** 1-based set of that exercise that is happening now or comes next. */
  currentSetNumber: number;
  setsDone: number;
  totalSets: number;
};

/** Works out where in the workout the player is, in terms of exercises and sets. */
export function getProgress(steps: Step[], index: number): ProgressInfo {
  const exercises: ProgressInfo['exercises'] = [];
  steps.forEach((s, i) => {
    if (s.kind !== 'work') return;
    let ex = exercises[exercises.length - 1];
    if (!ex || ex.itemIndex !== s.itemIndex) {
      ex = { item: s.item, itemIndex: s.itemIndex, sets: [] };
      exercises.push(ex);
    }
    ex.sets.push({ stepIndex: i, setNumber: s.setNumber });
  });

  // The current set is the work step at `index`, or the first one after it (during rest / prep).
  const current = steps.slice(index).find((s): s is WorkStep => s.kind === 'work');
  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const setsDone = exercises.reduce((n, e) => n + e.sets.filter((x) => x.stepIndex < index).length, 0);

  return {
    exercises,
    currentItemIndex: current ? exercises.findIndex((e) => e.itemIndex === current.itemIndex) : exercises.length - 1,
    currentSetNumber: current?.setNumber ?? 0,
    setsDone,
    totalSets,
  };
}

const DIM = 'rgba(255,255,255,0.25)';

/**
 * Segmented bar: one segment per set, grouped per exercise.
 * Finished sets are solid, the current set fills as it goes, the next set is outlined during rests.
 */
export function SetProgressBar({
  steps,
  index,
  fraction,
}: {
  steps: Step[];
  index: number;
  /** 0–1 progress through the current step if it is timed. */
  fraction: number;
}) {
  const p = getProgress(steps, index);
  const current = p.exercises[p.currentItemIndex];
  const onWork = steps[index]?.kind === 'work';

  return (
    <View style={{ gap: 8, marginTop: 14 }}>
      <View
        style={{ flexDirection: 'row', gap: 6 }}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${p.setsDone} of ${p.totalSets} sets done`}
        accessibilityValue={{ min: 0, max: p.totalSets, now: p.setsDone }}
      >
        {p.exercises.map((ex) => (
          <View key={ex.itemIndex} style={{ flex: ex.sets.length, flexDirection: 'row', gap: 2 }}>
            {ex.sets.map((s) => {
              const done = s.stepIndex < index;
              const active = s.stepIndex === index;
              const upcoming = !onWork && ex.itemIndex === current?.itemIndex && s.setNumber === p.currentSetNumber;
              return (
                <View
                  key={s.stepIndex}
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    overflow: 'hidden',
                    backgroundColor: done ? '#fff' : DIM,
                    borderWidth: upcoming ? 1.5 : 0,
                    borderColor: '#fff',
                  }}
                >
                  {active ? (
                    <View style={{ width: `${Math.max(12, fraction * 100)}%`, height: '100%', backgroundColor: '#fff' }} />
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={caption}>
          Exercise {p.currentItemIndex + 1} of {p.exercises.length}
          {current ? ` · Set ${p.currentSetNumber} of ${current.sets.length}` : ''}
        </Text>
        <Text style={caption}>
          {p.totalSets - p.setsDone} set{p.totalSets - p.setsDone === 1 ? '' : 's'} left
        </Text>
      </View>
    </View>
  );
}

/** List of the current exercise and everything after it, with per-set dots. */
export function ExercisesLeft({ steps, index }: { steps: Step[]; index: number }) {
  const p = getProgress(steps, index);
  const left = p.exercises.slice(p.currentItemIndex);
  if (left.length === 0) return null;

  return (
    // flexShrink lets the list give way (and scroll) on short screens instead of overlapping the timer.
    <View style={{ flexShrink: 1, minHeight: 0, marginBottom: 12, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
      <Text style={[caption, { marginBottom: 6, fontWeight: '800', letterSpacing: 1 }]}>
        {left.length === 1 ? 'LAST EXERCISE' : `EXERCISES LEFT · ${left.length}`}
      </Text>
      <ScrollView style={{ maxHeight: 132, flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false}>
        {left.map((ex, i) => {
          const isCurrent = i === 0;
          return (
            <View
              key={ex.itemIndex}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, opacity: isCurrent ? 1 : 0.8 }}
              accessibilityLabel={`${ex.item.exerciseName}, ${ex.sets.filter((s) => s.stepIndex < index).length} of ${ex.sets.length} sets done`}
            >
              <Text style={{ color: '#fff', fontWeight: isCurrent ? '800' : '600', fontSize: 15, flex: 1 }} numberOfLines={1}>
                {isCurrent ? '▶ ' : ''}
                {ex.item.exerciseName}
              </Text>
              <Text style={[caption, { fontSize: 12 }]}>{describeSet(ex.item)}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {ex.sets.map((s) => {
                  const done = s.stepIndex < index;
                  const active = s.stepIndex === index || (isCurrent && !done && s.setNumber === p.currentSetNumber);
                  return (
                    <View
                      key={s.stepIndex}
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 5,
                        backgroundColor: done ? '#fff' : 'transparent',
                        borderWidth: 1.5,
                        borderColor: active || done ? '#fff' : 'rgba(255,255,255,0.5)',
                        transform: [{ scale: active ? 1.25 : 1 }],
                      }}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const caption = { color: '#fff', opacity: 0.9, fontSize: 13, fontWeight: '600' as const };
