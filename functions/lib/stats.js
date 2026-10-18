// Чистые функции расчёта прогресса и оценок Larpdeez.
// Используются сервером (functions/api/tree.js) и тестами (tests/run.mjs).
// Клиент эти значения только отображает — расчёт всегда серверный.

export const GRADE_MAX = 100;

// Валидация оценки: целое 0..100 или null (не оценено).
export function normalizeGrade(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const g = Math.round(n);
  if (g < 0 || g > GRADE_MAX) return null;
  return g;
}

// Собирает все оценки курса ровно по одному разу:
// - каждое задание с grade != null;
// - финальный проект модуля с grade != null (только если проект включён).
// Двойной учёт исключён: оценки не усредняются на промежуточных уровнях,
// а собираются в один плоский список со всего дерева.
export function collectGrades(courseTree) {
  const grades = [];
  for (const m of courseTree.modules || []) {
    for (const d of m.disciplines || []) {
      for (const t of d.topics || []) {
        for (const a of t.assignments || []) {
          if (a.grade !== null && a.grade !== undefined) grades.push(a.grade);
        }
      }
    }
    const fp = m.finalProject;
    if (m.finalEnabled && fp && fp.grade !== null && fp.grade !== undefined) {
      grades.push(fp.grade);
    }
  }
  return grades;
}

// Средний балл по списку оценок; null если оценок нет.
export function averageGrade(grades) {
  if (!grades.length) return null;
  const sum = grades.reduce((s, g) => s + g, 0);
  return Math.round((sum / grades.length) * 10) / 10; // одно десятичное
}

// Правила завершения (Этап 7):
// - тема завершена, если отмечена пройденной;
// - дисциплина завершена, если пройдены ВСЕ её темы (пустая — не завершена);
// - модуль завершён, если завершены ВСЕ его дисциплины (без дисциплин — не завершён);
// - курс завершён, если завершены ВСЕ его модули.
// Прогресс в процентах = доля завершённых тем всех уровней (темы — атомарная единица).
export function computeCourseStats(courseTree) {
  let totalTopics = 0, doneTopics = 0;
  let gradedCount = 0;
  const modulesOut = [];

  for (const m of courseTree.modules || []) {
    let mTotal = 0, mDone = 0;
    const disciplinesOut = [];
    for (const d of m.disciplines || []) {
      let dTotal = 0, dDone = 0;
      for (const t of d.topics || []) {
        dTotal++;
        if (t.done) dDone++;
        for (const a of t.assignments || []) {
          if (a.grade !== null && a.grade !== undefined) { gradedCount++; }
        }
      }
      disciplinesOut.push({
        id: d.id,
        totalTopics: dTotal,
        doneTopics: dDone,
        completed: dTotal > 0 && dDone === dTotal,
        progressPercent: percent(dDone, dTotal),
      });
      mTotal += dTotal;
      mDone += dDone;
    }
    const fp = m.finalProject;
    const fpActive = !!(m.finalEnabled && fp);
    // Финальный проект участвует в прогрессе модуля как одна дополнительная «единица»,
    // завершённая при статусе done. Это явно определённое правило.
    let mTotalEff = mTotal, mDoneEff = mDone;
    if (fpActive) {
      mTotalEff += 1;
      if (fp.status === 'done') mDoneEff += 1;
      if (fp.grade !== null && fp.grade !== undefined) gradedCount++;
    }
    if (fpActive) {
      for (const c of fp.criteria || []) { /* критерии влияют только на статус проекта, не на прогресс тем */ void c; }
    }
    modulesOut.push({
      id: m.id,
      totalTopics: mTotal,
      doneTopics: mDone,
      completed: (m.disciplines || []).length > 0 && mTotal > 0 && mDone === mTotal &&
        (!fpActive || fp.status === 'done'),
      finalProjectDone: fpActive ? fp.status === 'done' : null,
      progressPercent: percent(mDoneEff, mTotalEff),
      disciplines: disciplinesOut,
    });
    totalTopics += mTotalEff;
    doneTopics += mDoneEff;
  }

  const grades = collectGrades(courseTree);
  return {
    totalTopics,
    doneTopics,
    progressPercent: percent(doneTopics, totalTopics),
    averageGrade: averageGrade(grades),
    gradedCount,
    modules: modulesOut,
    completed: (courseTree.modules || []).length > 0 &&
      modulesOut.every((x) => x.completed),
  };
}

export function percent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}
