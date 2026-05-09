import { randomUUID } from 'node:crypto';
import { focusStore } from '../store';
import type { AttentionAlert } from '../../../shared/schema/index';
import { isActiveAttentionAlert as isActive } from '../../../renderer/shared/lib/alerts';

function existingGeneratedIds(): Set<string> {
  return new Set(focusStore.get('attentionAlerts').map(a => `${a.sourceType}:${a.sourceId ?? a.title}`));
}

function createAlert(input: Omit<AttentionAlert, 'id' | 'status' | 'createdAt' | 'updatedAt'>): AttentionAlert {
  const now = Date.now();
  return {
    id: randomUUID(),
    status: 'new',
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export const attentionAlertService = {
  refreshGenerated(): AttentionAlert[] {
    const now = Date.now();
    const seen = existingGeneratedIds();
    const next: AttentionAlert[] = [];

    for (const deadline of focusStore.get('academicDeadlines')) {
      if (deadline.completed) continue;
      const hoursUntil = (deadline.deadlineAt - now) / 36e5;
      if (hoursUntil > 48) continue;
      const key = `deadline:${deadline.id}`;
      if (seen.has(key)) continue;
      next.push(createAlert({
        sourceType: 'deadline',
        sourceId: deadline.id,
        courseId: deadline.courseId,
        title: deadline.title,
        reason: hoursUntil < 0 ? 'Deadline is overdue.' : hoursUntil <= 24 ? 'Deadline is due within 24 hours.' : 'Deadline is due within 48 hours.',
        actionLabel: 'Open deadline',
        priority: hoursUntil < 0 ? 'critical' : hoursUntil <= 24 ? 'high' : 'medium',
        dueAt: deadline.deadlineAt,
      }));
    }

    for (const confusion of focusStore.get('confusionItems')) {
      if (confusion.status === 'resolved') continue;
      const key = `confusion:${confusion.id}`;
      if (seen.has(key)) continue;
      next.push(createAlert({
        sourceType: 'confusion',
        sourceId: confusion.id,
        courseId: confusion.courseId,
        title: confusion.question,
        reason: confusion.nextStep ?? 'Unresolved question needs a next step.',
        actionLabel: 'Resolve question',
        priority: 'medium',
      }));
    }

    for (const item of focusStore.get('studyItems')) {
      if (item.nextReviewAt && item.nextReviewAt > now) continue;
      const key = `study_review:${item.id}`;
      if (seen.has(key)) continue;
      next.push(createAlert({
        sourceType: 'study_review',
        sourceId: item.id,
        courseId: item.courseId,
        title: item.front,
        reason: 'Study item is due for review.',
        actionLabel: 'Review',
        priority: 'medium',
        dueAt: item.nextReviewAt,
      }));
    }

    for (const session of focusStore.get('classSessions')) {
      if (session.endedAt) continue;
      const key = `class_action:${session.id}`;
      if (seen.has(key)) continue;
      next.push(createAlert({
        sourceType: 'class_action',
        sourceId: session.id,
        courseId: session.courseId,
        title: session.title,
        reason: 'Class session is still active.',
        actionLabel: 'End class',
        priority: 'medium',
      }));
    }

    for (const assignment of focusStore.get('assignments')) {
      if (assignment.status === 'submitted' || assignment.status === 'archived') continue;
      if (!assignment.dueDate || assignment.dueDate - now > 24 * 36e5) continue;
      const checklist = [
        ...assignment.deliverables,
        ...assignment.formatRequirements,
        ...assignment.rubricItems,
        ...assignment.submissionChecklist,
      ];
      if (checklist.length === 0 || checklist.every(i => i.completed)) continue;
      const key = `assignment_checklist:${assignment.id}`;
      if (seen.has(key)) continue;
      next.push(createAlert({
        sourceType: 'assignment_checklist',
        sourceId: assignment.id,
        courseId: assignment.courseId,
        title: assignment.title,
        reason: 'Assignment is due soon with unfinished checklist items.',
        actionLabel: 'Open checklist',
        priority: 'high',
        dueAt: assignment.dueDate,
      }));
    }

    for (const alert of next) focusStore.addAttentionAlert(alert);
    return this.list();
  },

  list(opts?: { includeResolved?: boolean }): AttentionAlert[] {
    const now = Date.now();
    const priorityWeight = { critical: 0, high: 1, medium: 2, low: 3 };
    return focusStore.get('attentionAlerts')
      .filter(a => opts?.includeResolved || isActive(a, now))
      .sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority] || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
  },

  snooze(id: string, snoozedUntil: number): AttentionAlert {
    focusStore.updateAttentionAlert(id, { status: 'snoozed', snoozedUntil });
    return focusStore.get('attentionAlerts').find(a => a.id === id)!;
  },

  dismiss(id: string): AttentionAlert {
    focusStore.updateAttentionAlert(id, { status: 'dismissed' });
    return focusStore.get('attentionAlerts').find(a => a.id === id)!;
  },

  resolve(id: string): AttentionAlert {
    focusStore.updateAttentionAlert(id, { status: 'resolved' });
    return focusStore.get('attentionAlerts').find(a => a.id === id)!;
  },
};

export { isActive as isActiveAttentionAlert };
