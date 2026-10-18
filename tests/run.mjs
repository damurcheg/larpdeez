// Юнит-тесты формул прогресса и оценок (Этап 7, 11).
// Запуск: node tests/run.mjs
import { computeCourseStats, averageGrade, collectGrades, normalizeGrade } from '../functions/lib/stats.js';

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('PASS', name); }
  catch (e) { failed++; console.error('FAIL', name, '-', e.message); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
function ok(x, msg) { if (!x) throw new Error(msg || 'not ok'); }

const A = (grade, done = false) => ({ grade, done });
const T = (topics) => topics;
const D = (disciplines) => disciplines;
const M = (mods) => mods;

t('normalizeGrade: границы и null', () => {
  eq(normalizeGrade(95), 95);
  eq(normalizeGrade(101), null);
  eq(normalizeGrade(-1), null);
  eq(normalizeGrade(null), null);
  eq(normalizeGrade(''), null);
  eq(normalizeGrade('88.4'), 88);
});

t('пустой курс: 0%, средний балл null', () => {
  const s = computeCourseStats({ modules: [] });
  eq(s.progressPercent, 0);
  eq(s.averageGrade, null);
  eq(s.completed, false);
});

t('тема завершена по флагу; дисциплина — когда все темы пройдены', () => {
  const tree = { modules: [{ finalEnabled: false, disciplines: [
    { topics: [{ done: true, assignments: [] }, { done: false, assignments: [] }] },
  ] }] };
  const s = computeCourseStats(tree);
  eq(s.totalTopics, 2);
  eq(s.doneTopics, 1);
  eq(s.progressPercent, 50);
  eq(s.modules[0].completed, false);
  eq(s.modules[0].disciplines[0].completed, false);
});

t('модуль без дисциплин не завершён', () => {
  const s = computeCourseStats({ modules: [{ finalEnabled: false, disciplines: [] }] });
  eq(s.modules[0].completed, false);
});

t('полный курс завершён: все темы всех дисциплин всех модулей', () => {
  const tree = { modules: [
    { finalEnabled: false, disciplines: [{ topics: [{ done: true, assignments: [] }] }] },
    { finalEnabled: false, disciplines: [
      { topics: [{ done: true, assignments: [] }] },
      { topics: [{ done: true, assignments: [] }] },
    ] },
  ] };
  const s = computeCourseStats(tree);
  eq(s.progressPercent, 100);
  eq(s.completed, true);
});

t('средний балл: неоценённые задания исключаются', () => {
  const tree = { modules: [{ finalEnabled: false, disciplines: [{ topics: [{ done: false, assignments: [
    { grade: 80 }, { grade: null }, { grade: 90 },
  ] }] }] }] };
  const s = computeCourseStats(tree);
  eq(s.averageGrade, 85);
  eq(s.gradedCount, 2);
});

t('оценка финального проекта учитывается ровно один раз', () => {
  const tree = { modules: [{
    finalEnabled: true,
    finalProject: { status: 'in_progress', grade: 70, criteria: [] },
    disciplines: [{ topics: [{ done: true, assignments: [{ grade: 90 }] }] }],
  }] };
  const grades = collectGrades(tree);
  eq(grades, [90, 70]); // каждая оценка один раз, без усреднения по уровням
  eq(averageGrade(grades), 80);
  const s = computeCourseStats(tree);
  eq(s.averageGrade, 80);
});

t('финальный проект без оценки не влияет на средний балл', () => {
  const tree = { modules: [{
    finalEnabled: true,
    finalProject: { status: 'done', grade: null, criteria: [] },
    disciplines: [{ topics: [{ done: false, assignments: [{ grade: 60 }] }] }],
  }] };
  const s = computeCourseStats(tree);
  eq(s.averageGrade, 60);
});

t('отключённый финальный проект не участвует ни в чём', () => {
  const tree = { modules: [{
    finalEnabled: false,
    finalProject: { status: 'done', grade: 100, criteria: [] },
    disciplines: [{ topics: [{ done: true, assignments: [] }] }],
  }] };
  const s = computeCourseStats(tree);
  eq(s.totalTopics, 1);
  eq(s.averageGrade, null);
  eq(s.modules[0].completed, true);
});

t('проект со статусом done завершает модуль и добавляет единицу прогресса', () => {
  const tree = { modules: [{
    finalEnabled: true,
    finalProject: { status: 'done', grade: null, criteria: [] },
    disciplines: [{ topics: [{ done: true, assignments: [] }] }],
  }] };
  const s = computeCourseStats(tree);
  eq(s.totalTopics, 2); // тема + проект
  eq(s.doneTopics, 2);
  eq(s.modules[0].completed, true);
  eq(s.completed, true);
});

t('незавершённый проект не даёт модулю статуса completed', () => {
  const tree = { modules: [{
    finalEnabled: true,
    finalProject: { status: 'todo', grade: null, criteria: [] },
    disciplines: [{ topics: [{ done: true, assignments: [] }] }],
  }] };
  const s = computeCourseStats(tree);
  eq(s.modules[0].completed, false);
  eq(s.progressPercent, 50);
});

t('нет двойного учёта при нескольких модулях', () => {
  const tree = { modules: [
    { finalEnabled: true, finalProject: { status: 'todo', grade: 50, criteria: [] },
      disciplines: [{ topics: [{ done: false, assignments: [{ grade: 100 }, { grade: null }] }] }] },
    { finalEnabled: false,
      disciplines: [{ topics: [{ done: false, assignments: [{ grade: 60 }] }] }] },
  ] };
  const grades = collectGrades(tree);
  eq(grades, [100, 50, 60]);
  eq(averageGrade(grades), Math.round(((100 + 50 + 60) / 3) * 10) / 10);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
