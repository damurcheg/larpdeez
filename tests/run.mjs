// ╨«╨╜╨╕╤é-╤é╨╡╤ü╤é╤ï ╤ä╨╛╤Ç╨╝╤â╨╗ ╨┐╤Ç╨╛╨│╤Ç╨╡╤ü╤ü╨░ ╨╕ ╨╛╤å╨╡╨╜╨╛╨║ (╨¡╤é╨░╨┐ 7, 11).
// ╨ù╨░╨┐╤â╤ü╨║: node tests/run.mjs
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

t('normalizeGrade: ╨│╤Ç╨░╨╜╨╕╤å╤ï ╨╕ null', () => {
  eq(normalizeGrade(95), 95);
  eq(normalizeGrade(101), null);
  eq(normalizeGrade(-1), null);
  eq(normalizeGrade(null), null);
  eq(normalizeGrade(''), null);
  eq(normalizeGrade('88.4'), 88);
});

t('╨┐╤â╤ü╤é╨╛╨╣ ╨║╤â╤Ç╤ü: 0%, ╤ü╤Ç╨╡╨┤╨╜╨╕╨╣ ╨▒╨░╨╗╨╗ null', () => {
  const s = computeCourseStats({ modules: [] });
  eq(s.progressPercent, 0);
  eq(s.averageGrade, null);
  eq(s.completed, false);
});

t('╤é╨╡╨╝╨░ ╨╖╨░╨▓╨╡╤Ç╤ê╨╡╨╜╨░ ╨┐╨╛ ╤ä╨╗╨░╨│╤â; ╨┤╨╕╤ü╤å╨╕╨┐╨╗╨╕╨╜╨░ ΓÇö ╨║╨╛╨│╨┤╨░ ╨▓╤ü╨╡ ╤é╨╡╨╝╤ï ╨┐╤Ç╨╛╨╣╨┤╨╡╨╜╤ï', () => {
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

t('╨╝╨╛╨┤╤â╨╗╤î ╨▒╨╡╨╖ ╨┤╨╕╤ü╤å╨╕╨┐╨╗╨╕╨╜ ╨╜╨╡ ╨╖╨░╨▓╨╡╤Ç╤ê╤æ╨╜', () => {
  const s = computeCourseStats({ modules: [{ finalEnabled: false, disciplines: [] }] });
  eq(s.modules[0].completed, false);
});

t('╨┐╨╛╨╗╨╜╤ï╨╣ ╨║╤â╤Ç╤ü ╨╖╨░╨▓╨╡╤Ç╤ê╤æ╨╜: ╨▓╤ü╨╡ ╤é╨╡╨╝╤ï ╨▓╤ü╨╡╤à ╨┤╨╕╤ü╤å╨╕╨┐╨╗╨╕╨╜ ╨▓╤ü╨╡╤à ╨╝╨╛╨┤╤â╨╗╨╡╨╣', () => {
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

t('╤ü╤Ç╨╡╨┤╨╜╨╕╨╣ ╨▒╨░╨╗╨╗: ╨╜╨╡╨╛╤å╨╡╨╜╤æ╨╜╨╜╤ï╨╡ ╨╖╨░╨┤╨░╨╜╨╕╤Å ╨╕╤ü╨║╨╗╤Ä╤ç╨░╤Ä╤é╤ü╤Å', () => {
  const tree = { modules: [{ finalEnabled: false, disciplines: [{ topics: [{ done: false, assignments: [
    { grade: 80 }, { grade: null }, { grade: 90 },
  ] }] }] }] };
  const s = computeCourseStats(tree);
  eq(s.averageGrade, 85);
  eq(s.gradedCount, 2);
});

t('╨╛╤å╨╡╨╜╨║╨░ ╤ä╨╕╨╜╨░╨╗╤î╨╜╨╛╨│╨╛ ╨┐╤Ç╨╛╨╡╨║╤é╨░ ╤â╤ç╨╕╤é╤ï╨▓╨░╨╡╤é╤ü╤Å ╤Ç╨╛╨▓╨╜╨╛ ╨╛╨┤╨╕╨╜ ╤Ç╨░╨╖', () => {
  const tree = { modules: [{
    finalEnabled: true,
    finalProject: { status: 'in_progress', grade: 70, criteria: [] },
    disciplines: [{ topics: [{ done: true, assignments: [{ grade: 90 }] }] }],
  }] };
  const grades = collectGrades(tree);
  eq(grades, [90, 70]); // ╨║╨░╨╢╨┤╨░╤Å ╨╛╤å╨╡╨╜╨║╨░ ╨╛╨┤╨╕╨╜ ╤Ç╨░╨╖, ╨▒╨╡╨╖ ╤â╤ü╤Ç╨╡╨┤╨╜╨╡╨╜╨╕╤Å ╨┐╨╛ ╤â╤Ç╨╛╨▓╨╜╤Å╨╝
  eq(averageGrade(grades), 80);
  const s = computeCourseStats(tree);
  eq(s.averageGrade, 80);
});

t('╤ä╨╕╨╜╨░╨╗╤î╨╜╤ï╨╣ ╨┐╤Ç╨╛╨╡╨║╤é ╨▒╨╡╨╖ ╨╛╤å╨╡╨╜╨║╨╕ ╨╜╨╡ ╨▓╨╗╨╕╤Å╨╡╤é ╨╜╨░ ╤ü╤Ç╨╡╨┤╨╜╨╕╨╣ ╨▒╨░╨╗╨╗', () => {
  const tree = { modules: [{
    finalEnabled: true,
    finalProject: { status: 'done', grade: null, criteria: [] },
    disciplines: [{ topics: [{ done: false, assignments: [{ grade: 60 }] }] }],
  }] };
  const s = computeCourseStats(tree);
  eq(s.averageGrade, 60);
});

t('╨╛╤é╨║╨╗╤Ä╤ç╤æ╨╜╨╜╤ï╨╣ ╤ä╨╕╨╜╨░╨╗╤î╨╜╤ï╨╣ ╨┐╤Ç╨╛╨╡╨║╤é ╨╜╨╡ ╤â╤ç╨░╤ü╤é╨▓╤â╨╡╤é ╨╜╨╕ ╨▓ ╤ç╤æ╨╝', () => {
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

t('╨┐╤Ç╨╛╨╡╨║╤é ╤ü╨╛ ╤ü╤é╨░╤é╤â╤ü╨╛╨╝ done ╨╖╨░╨▓╨╡╤Ç╤ê╨░╨╡╤é ╨╝╨╛╨┤╤â╨╗╤î ╨╕ ╨┤╨╛╨▒╨░╨▓╨╗╤Å╨╡╤é ╨╡╨┤╨╕╨╜╨╕╤å╤â ╨┐╤Ç╨╛╨│╤Ç╨╡╤ü╤ü╨░', () => {
  const tree = { modules: [{
    finalEnabled: true,
    finalProject: { status: 'done', grade: null, criteria: [] },
    disciplines: [{ topics: [{ done: true, assignments: [] }] }],
  }] };
  const s = computeCourseStats(tree);
  eq(s.totalTopics, 2); // ╤é╨╡╨╝╨░ + ╨┐╤Ç╨╛╨╡╨║╤é
  eq(s.doneTopics, 2);
  eq(s.modules[0].completed, true);
  eq(s.completed, true);
});

t('╨╜╨╡╨╖╨░╨▓╨╡╤Ç╤ê╤æ╨╜╨╜╤ï╨╣ ╨┐╤Ç╨╛╨╡╨║╤é ╨╜╨╡ ╨┤╨░╤æ╤é ╨╝╨╛╨┤╤â╨╗╤Ä ╤ü╤é╨░╤é╤â╤ü╨░ completed', () => {
  const tree = { modules: [{
    finalEnabled: true,
    finalProject: { status: 'todo', grade: null, criteria: [] },
    disciplines: [{ topics: [{ done: true, assignments: [] }] }],
  }] };
  const s = computeCourseStats(tree);
  eq(s.modules[0].completed, false);
  eq(s.progressPercent, 50);
});

t('╨╜╨╡╤é ╨┤╨▓╨╛╨╣╨╜╨╛╨│╨╛ ╤â╤ç╤æ╤é╨░ ╨┐╤Ç╨╕ ╨╜╨╡╤ü╨║╨╛╨╗╤î╨║╨╕╤à ╨╝╨╛╨┤╤â╨╗╤Å╤à', () => {
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
