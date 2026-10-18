// Редактор курса (editor.html): дерево Курс → Модуль → Дисциплина → Тема → Задание,
// рабочая область с созданием/редактированием/удалением элементов и изменением порядка.
// Все изменения — через PATCH /api/tree (пакетные операции), прогресс считает сервер.
(function () {
  const esc = UI.esc;
  const params = new URLSearchParams(location.search);

  let courseId = params.get('course') || '';
  let selectedId = params.get('node') || '';
  let tree = null;          // последний ответ /api/tree
  let index = {};           // id -> { kind, node, parentId, parentKind, siblings, pos }
  let collapsed = {};       // id -> true (состояние сворачивания)
  let filterQ = '';
  let drag = null;          // { id, kind, parentId }
  let dropTarget = null;    // { id, before:boolean }

  const treeScroll = document.getElementById('tree-scroll');
  const wsEl = document.getElementById('workspace');

  // ---------- Индексация дерева ----------
  function reindex() {
    index = {};
    if (!tree) return;
    index[tree.course.id] = { kind: 'course', node: tree.course, parentId: null };
    for (const m of tree.modules) {
      index[m.id] = { kind: 'module', node: m, parentId: tree.course.id, table: 'modules', siblings: tree.modules };
      for (const d of m.disciplines) {
        index[d.id] = { kind: 'discipline', node: d, parentId: m.id, table: 'disciplines', siblings: m.disciplines };
        for (const t of d.topics) {
          index[t.id] = { kind: 'topic', node: t, parentId: d.id, table: 'topics', siblings: d.topics };
          for (const a of t.assignments) {
            index[a.id] = { kind: 'assignment', node: a, parentId: t.id, table: 'assignments', siblings: t.assignments };
          }
        }
      }
    }
  }

  const KIND_LABEL = { course: 'Курс', module: 'Модуль', discipline: 'Дисциплина', topic: 'Тема', assignment: 'Задание', final: 'Финальный проект' };
  const KIND_ICON = { course: 'book-open', module: 'layers', discipline: 'folder-open', topic: 'file-text', assignment: 'clipboard-list', final: 'flag' };

  function tintOf(kind, node, parentColor) {
    const explicit = node.color || (kind !== 'course' && parentColor ? '' : '');
    const eff = node.color || parentColor || (tree ? tree.course.color : '#007AFF');
    return UI.tintForHex(explicit || '') || UI.nodeTint(node.id, eff);
  }

  function effColorOf(id) {
    // Эффективный цвет: свой или родителя.
    let cur = index[id];
    while (cur) {
      if (cur.node.color) return cur.node.color;
      cur = cur.parentId ? index[cur.parentId] : null;
    }
    return tree ? tree.course.color : '#007AFF';
  }

  // ---------- Дерево ----------
  function matchesFilter(id) {
    if (!filterQ) return true;
    const q = filterQ.toLowerCase();
    const ent = index[id];
    if (!ent) return false;
    if (String(ent.node.title || '').toLowerCase().includes(q)) return true;
    // потомки
    const kids = childIds(id);
    return kids.some((k) => matchesFilter(k));
  }
  function childIds(id) {
    const ent = index[id];
    if (!ent) return [];
    if (ent.kind === 'course') return tree.modules.map((m) => m.id);
    if (ent.kind === 'module') return ent.node.disciplines.map((d) => d.id).concat(ent.node.finalEnabled && ent.node.finalProject ? [ent.node.finalProject.id] : []);
    if (ent.kind === 'discipline') return ent.node.topics.map((t) => t.id);
    if (ent.kind === 'topic') return ent.node.assignments.map((a) => a.id);
    return [];
  }

  function rowHtml(id, depth) {
    const ent = index[id];
    if (!ent) return '';
    const isFinal = ent.kind === 'final';
    const node = ent.node;
    const kids = childIds(id).filter(matchesFilter);
    const hasKids = kids.length > 0;
    const isCollapsed = !!collapsed[id] && !filterQ;
    const tint = isFinal ? 'tint-orange' : tintOf(ent.kind, node, ent.parentId ? effColorOf(ent.parentId) : '');
    const doneCls = (ent.kind === 'topic' && node.done) ? ' is-done' : '';
    const badge =
      ent.kind === 'module' ? `<span class="tree-badge">${node.disciplines.reduce((s, d) => s + d.topics.length, 0)}</span>` :
      ent.kind === 'discipline' ? `<span class="tree-badge">${node.topics.length}</span>` :
      ent.kind === 'topic' && node.date ? `<span class="tree-badge">${UI.fmtDateRu(node.date).replace(/ \d{4}$/, '')}</span>` :
      ent.kind === 'topic' ? `<span class="tree-badge">${node.assignments.length ? node.assignments.length + ' з.' : ''}</span>` : '';
    return `<div class="tree-node${isCollapsed ? ' tree-collapsed' : ''}" data-node="${id}">
      <div class="tree-row ${selectedId === id ? 'selected' : ''} ${tint}" data-id="${id}" draggable="${!isFinal ? 'true' : 'false'}" style="--depth:${depth}">
        <button class="tree-twist" type="button" data-twist="${id}">${hasKids ? LD.icon('chevron-down', 13) : '<span style="width:13px"></span>'}</button>
        <span class="tree-ico">${LD.icon(isFinal ? 'flag' : KIND_ICON[ent.kind], 14)}</span>
        <span class="tree-title${doneCls}">${esc(node.title)}</span>
        ${badge}
        <span class="tree-actions">
          <button class="icon-btn small" type="button" data-menu="${id}" title="Ещё">${LD.icon('more-horizontal', 13)}</button>
        </span>
      </div>
      ${hasKids ? `<div class="tree-children">${kids.map((k) => rowHtml(k, depth + 1)).join('')}</div>` : ''}
    </div>`;
  }

  function renderTree() {
    if (!tree) return;
    const rootKids = childIds(tree.course.id).filter(matchesFilter);
    let html = rowHtml(tree.course.id, 0);
    if (!rootKids.length) {
      html += `<div class="tree-empty-note" style="padding-left:6px">Пока нет модулей. Нажмите «+» над деревом.</div>`;
    }
    if (filterQ && !rootKids.length) {
      html += `<div class="tree-empty-note" style="padding-left:6px">Ничего не найдено.</div>`;
    }
    treeScroll.innerHTML = html;
  }

  // ---------- Рабочая область ----------
  let dlgColor = ''; // выбранный цвет в текущем диалоге

  function colorSlotHtml() { return '<div id="ld-color-slot"></div>'; }
  function mountColor(root, value, emptyLabel) {
    dlgColor = value || '';
    UI.colorPicker(root.querySelector('#ld-color-slot'), value, { allowEmpty: true, emptyLabel }, (v) => { dlgColor = v; });
  }
  function fieldText(name, value, placeholder) {
    return `<textarea class="textarea" name="${name}" placeholder="${placeholder || ''}" style="min-height:88px">${esc(value || '')}</textarea>`;
  }

  function linkEditorHtml(links) {
    links = links || [];
    return `<div class="field"><label>Ссылки <span class="muted small">(одна в строке: https://…  Название)</span></label>
      <textarea class="textarea" name="linksText" style="min-height:64px" placeholder="https://example.com  Статья о теме">${links.map((l) => l.url + (l.label ? '  ' + l.label : '')).join('\n')}</textarea></div>`;
  }
  function parseLinks(text) {
    return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => {
      const parts = s.split(/\s{2,}/);
      return { url: parts[0], label: parts.slice(1).join(' ') };
    });
  }

  async function submitOps(ops) {
    await UI.treeOps(ops, courseId);
    await reload();
  }

  // ----- Диалоги создания/редактирования -----
  async function editModule(m) {
    const isNew = !m;
    m = m || { title: '', description: '', color: '', tags: [], finalEnabled: false };
    const result = await UI.dialog({
      title: isNew ? 'Новый модуль' : 'Модуль',
      okLabel: isNew ? 'Создать' : 'Сохранить',
      fields: `
        <div class="field"><label>Название *</label><input class="input" name="title" maxlength="200" required value="${esc(m.title)}" placeholder="Например, Модуль 1. Основы"></div>
        <div class="field"><label>Описание</label>${fieldText('description', m.description)}</div>
        <div class="field-row">
          <div><label>Цвет</label>${colorSlotHtml()}</div>
          <div><label>Теги <span class="muted small">(до 6, через запятую)</span></label><input class="input" name="tags" value="${esc((m.tags || []).join(', '))}" placeholder="грамматика, лексика"></div>
        </div>
        <label class="switch"><input type="checkbox" name="finalEnabled" ${m.finalEnabled ? 'checked' : ''}><span class="track"></span><span>Включить финальный проект модуля</span></label>`,
      onOk: async (v) => {
        const title = String(v.title || '').trim();
        if (!title) throw new Error('Название модуля обязательно.');
        const op = {
          op: isNew ? 'module.create' : 'module.update',
          id: isNew ? UI.uid() : m.id,
          courseId, title,
          description: v.description || '',
          color: dlgColor || '',
          tags: String(v.tags || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6),
          finalEnabled: !!v.finalEnabled,
        };
        await submitOps([op]);
        selectNode(op.id);
        return true;
      },
      onMount: (root) => mountColor(root, m.color, 'Наследовать цвет курса'),
    });
    if (!result) return;
  }

  async function editDiscipline(d, moduleId) {
    const isNew = !d;
    d = d || { title: '', description: '', color: '' };
    await UI.dialog({
      title: isNew ? 'Новая дисциплина' : 'Дисциплина',
      okLabel: isNew ? 'Создать' : 'Сохранить',
      fields: `
        <div class="field"><label>Название *</label><input class="input" name="title" maxlength="200" required value="${esc(d.title)}" placeholder="Например, Грамматика"></div>
        <div class="field"><label>Описание</label>${fieldText('description', d.description)}</div>
        <div class="field"><label>Цвет</label>${colorSlotHtml()}</div>`,
      onOk: async (v) => {
        const title = String(v.title || '').trim();
        if (!title) throw new Error('Название дисциплины обязательно.');
        const op = {
          op: isNew ? 'discipline.create' : 'discipline.update',
          id: isNew ? UI.uid() : d.id,
          moduleId: isNew ? moduleId : (index[d.id] ? index[d.id].parentId : moduleId),
          title, description: v.description || '', color: dlgColor || '',
        };
        await submitOps([op]);
        selectNode(op.id);
        return true;
      },
      onMount: (root) => mountColor(root, d.color, 'Наследовать цвет модуля'),
    });
  }

  async function editTopic(t) {
    const isNew = !t;
    const ent = t && index[t.id];
    t = t || { title: '', content: '', date: '', links: [], color: '' };
    const disciplineId = isNew ? entParent : t.id && index[t.id] ? index[t.id].parentId : entParent;
    await UI.dialog({
      title: isNew ? 'Новая тема' : 'Тема',
      okLabel: isNew ? 'Создать' : 'Сохранить',
      wide: true,
      fields: `
        <div class="field"><label>Название *</label><input class="input" name="title" maxlength="300" required value="${esc(t.title)}" placeholder="Например, Настоящее время"></div>
        <div class="field"><label>Дата темы (попадает в календарь)</label><input class="input" type="date" name="date" value="${esc(t.date || '')}"></div>
        <div class="field"><label>Материал темы</label>${fieldText('content', t.content, 'Конспект, заметки, план…')}</div>
        ${linkEditorHtml(t.links)}
        <div class="field"><label>Цвет</label>${colorSlotHtml()}</div>`,
      onOk: async (v) => {
        const title = String(v.title || '').trim();
        if (!title) throw new Error('Название темы обязательно.');
        const links = parseLinks(v.linksText);
        const op = {
          op: isNew ? 'topic.create' : 'topic.update',
          id: isNew ? UI.uid() : t.id,
          disciplineId: isNew ? disciplineId : (index[t.id] ? index[t.id].parentId : disciplineId),
          title, content: v.content || '', date: v.date || '', links,
          color: dlgColor || '',
        };
        await submitOps([op]);
        selectNode(op.id);
        return true;
      },
      onMount: (root) => mountColor(root, t.color, 'Наследовать цвет дисциплины'),
    });
  }

  async function editAssignment(a) {
    const isNew = !a;
    a = a || { title: '', description: '', criteria: [], grade: null, color: '' };
    const topicId = isNew ? entParent : (index[a.id] ? index[a.id].parentId : entParent);
    await UI.dialog({
      title: isNew ? 'Новое задание' : 'Задание',
      okLabel: isNew ? 'Создать' : 'Сохранить',
      wide: true,
      fields: `
        <div class="field"><label>Название *</label><input class="input" name="title" maxlength="300" required value="${esc(a.title)}" placeholder="Что нужно сделать"></div>
        <div class="field"><label>Описание</label>${fieldText('description', a.description)}</div>
        <div class="field"><label>Критерии оценки <span class="muted small">(по одному в строке)</span></label>
          <textarea class="textarea" name="criteriaText" style="min-height:64px">${esc((a.criteria || []).join('\n'))}</textarea></div>
        <div class="field-row">
          <div><label>Оценка <span class="muted small">(0–100, пусто — не оценено)</span></label><input class="input" type="number" name="grade" min="0" max="100" step="1" value="${a.grade == null ? '' : a.grade}"></div>
          <div><label>Цвет</label>${colorSlotHtml()}</div>
        </div>`,
      onOk: async (v) => {
        const title = String(v.title || '').trim();
        if (!title) throw new Error('Название задания обязательно.');
        const g = v.grade === '' ? null : Number(v.grade);
        if (g !== null && (!Number.isFinite(g) || g < 0 || g > 100)) throw new Error('Оценка — число от 0 до 100.');
        const op = {
          op: isNew ? 'assignment.create' : 'assignment.update',
          id: isNew ? UI.uid() : a.id,
          topicId, title,
          description: v.description || '',
          criteria: String(v.criteriaText || '').split('\n').map((x) => x.trim()).filter(Boolean),
          grade: g, color: dlgColor || '',
        };
        await submitOps([op]);
        selectNode(op.id);
        return true;
      },
      onMount: (root) => mountColor(root, a.color, 'Без цвета'),
    });
  }

  async function editFinal(moduleId) {
    const m = index[moduleId].node;
    const f = m.finalProject || { title: 'Финальный проект', description: '', dueDate: '', icon: 'flag', criteria: [], links: [], status: 'todo', grade: null };
    const EV_ICONS = [['flag', 'flag'], ['star', 'star'], ['trophy', 'trophy'], ['target', 'target'], ['book', 'book'], ['code', 'code'], ['palette', 'palette'], ['music', 'music'], ['pen-line', 'pen'], ['flask-conical', 'flask'], ['calendar', 'calendar'], ['clipboard-list', 'clipboard']];
    await UI.dialog({
      title: 'Финальный проект модуля',
      wide: true,
      fields: `
        <div class="field"><label>Название</label><input class="input" name="title" maxlength="200" value="${esc(f.title)}"></div>
        <div class="field"><label>Описание</label>${fieldText('description', f.description)}</div>
        <div class="field-row">
          <div><label>Срок сдачи</label><input class="input" type="date" name="dueDate" value="${esc(f.dueDate || '')}"></div>
          <div><label>Статус</label><select class="input" name="status">
            <option value="todo" ${f.status === 'todo' ? 'selected' : ''}>Не начат</option>
            <option value="in_progress" ${f.status === 'in_progress' ? 'selected' : ''}>В работе</option>
            <option value="done" ${f.status === 'done' ? 'selected' : ''}>Завершён</option>
          </select></div>
          <div><label>Оценка <span class="muted small">(0–100)</span></label><input class="input" type="number" name="grade" min="0" max="100" value="${f.grade == null ? '' : f.grade}"></div>
        </div>
        <div class="field"><label>Иконка</label><div class="icon-grid" id="fp-icon-grid">
          ${EV_ICONS.map(([ic, val]) => `<button type="button" class="icon-choice ${f.icon === val ? 'selected' : ''}" data-val="${val}">${LD.icon(ic, 15)}</button>`).join('')}
        </div></div>
        <div class="field"><label>Критерии <span class="muted small">(по одному в строке; готовые отметьте прямо в карточке проекта)</span></label>
          <textarea class="textarea" name="criteriaText" style="min-height:64px">${esc((f.criteria || []).map((c) => c.text).join('\n'))}</textarea></div>
        ${linkEditorHtml(f.links)}`,
      onOk: async (v) => {
        const g = v.grade === '' ? null : Number(v.grade);
        if (g !== null && (!Number.isFinite(g) || g < 0 || g > 100)) throw new Error('Оценка — число от 0 до 100.');
        const chosenIcon = (document.querySelector('.dialog-backdrop .icon-choice.selected') || {}).dataset?.val || 'flag';
        // Сохраняем существующие отметки критериев по тексту.
        const oldCrit = f.criteria || [];
        const criteria = String(v.criteriaText || '').split('\n').map((x) => x.trim()).filter(Boolean)
          .map((text) => { const prev = oldCrit.find((c) => c.text === text); return { text, done: prev ? prev.done : false }; });
        await submitOps([{
          op: 'final.update', id: moduleId,
          title: String(v.title || '').trim() || 'Финальный проект',
          description: v.description || '', dueDate: v.dueDate || '', icon: chosenIcon,
          criteria, links: parseLinks(v.linksText), status: v.status, grade: g,
        }]);
        return true;
      },
      onMount: (root) => {
        root.querySelectorAll('.icon-choice').forEach((b) => b.addEventListener('click', () => {
          root.querySelectorAll('.icon-choice').forEach((x) => x.classList.remove('selected'));
          b.classList.add('selected');
        }));
      },
    });
  }

  // ---------- Удаление ----------
  async function deleteNode(id) {
    const ent = index[id];
    if (!ent) return;
    const names = { module: 'модуль', discipline: 'дисциплину', topic: 'тему', assignment: 'задание' };
    const extra = {
      module: 'Все дисциплины, темы, задания и финальный проект модуля будут удалены.',
      discipline: 'Все темы и задания дисциплины будут удалены.',
      topic: 'Все задания темы будут удалены.',
      assignment: '',
    }[ent.kind];
    const ok = await UI.confirmDialog(`Удалить ${names[ent.kind]} «${ent.node.title}»?`, extra || 'Действие необратимо.', 'Удалить');
    if (!ok) return;
    try {
      await submitOps([{ op: ent.kind + '.delete', id }]);
      if (selectedId === id) selectedId = ent.parentId;
      UI.toast('Удалено', 'success');
      renderAll();
    } catch (e) { UI.toast(e.message || 'Не удалось удалить', 'error'); }
  }

  // ---------- Порядок (drag & drop + кнопки) ----------
  function moveSibling(id, dir) {
    const ent = index[id];
    if (!ent || !ent.siblings) return;
    const arr = ent.siblings.slice().sort((a, b) => a.position - b.position);
    const i = arr.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const ids = arr.map((x) => x.id);
    ids.splice(i, 1); ids.splice(j, 0, id);
    commitReorder(ent.table, ids);
  }

  async function commitReorder(table, ids) {
    try {
      await submitOps([{ op: 'reorder', table, ids }]);
    } catch (e) { UI.toast(e.message || 'Не удалось изменить порядок', 'error'); }
  }

  function findDropZone(e) {
    const row = e.target.closest('.tree-row');
    if (!row) return null;
    const id = row.dataset.id;
    const ent = index[id];
    if (!drag || !ent) return null;
    if (id === drag.id) return null;
    // Разрешаем перестановку только между соседями одного родителя.
    if (ent.parentId !== drag.parentId) return null;
    if (ent.kind !== index[drag.id].kind) return null;
    const r = row.getBoundingClientRect();
    return { id, before: e.clientY < r.top + r.height / 2 };
  }

  treeScroll.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.tree-row');
    if (!row || row.draggable !== 'true') return;
    const ent = index[row.dataset.id];
    if (!ent || ent.kind === 'course') return;
    drag = { id: ent.node.id, kind: ent.kind, parentId: ent.parentId };
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', drag.id); } catch (err) {}
  });
  treeScroll.addEventListener('dragend', clearDrag);
  function clearDrag() {
    drag = null;
    treeScroll.querySelectorAll('.dragging,.drop-before,.drop-after').forEach((el) => el.classList.remove('dragging', 'drop-before', 'drop-after'));
  }
  treeScroll.addEventListener('dragover', (e) => {
    if (!drag) return;
    const z = findDropZone(e);
    treeScroll.querySelectorAll('.drop-before,.drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    if (!z) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dropTarget = z;
    const row = treeScroll.querySelector(`.tree-row[data-id="${z.id}"]`);
    if (row) row.classList.add(z.before ? 'drop-before' : 'drop-after');
  });
  treeScroll.addEventListener('drop', (e) => {
    if (!drag) return;
    const z = findDropZone(e);
    e.preventDefault();
    clearDrag();
    if (!z) return;
    const ent = index[drag.id];
    const arr = ent.siblings.slice().sort((a, b) => a.position - b.position);
    const ids = arr.map((x) => x.id);
    ids.splice(ids.indexOf(drag.id), 1);
    let at = ids.indexOf(z.id);
    if (!z.before) at += 1;
    ids.splice(at, 0, drag.id);
    commitReorder(ent.table, ids);
    drag = null;
  });

  // ---------- Меню узла ----------
  function nodeMenu(id, anchor) {
    const ent = index[id];
    if (!ent) return;
    const items = [];
    if (ent.kind === 'course') {
      items.push({ id: 'add-mod', label: 'Новый модуль', icon: 'plus', action: () => editModule(null) });
      items.push({ id: 'settings', label: 'Настройки курса', icon: 'settings', action: async () => {
        const r = await UI.editCourseDialog(tree.course);
        if (r) { await UI.loadCourses(true); await reload(); }
      } });
      items.push({ sep: true });
      items.push({ id: 'del-course', label: 'Удалить курс', icon: 'trash-2', danger: true, action: async () => {
        const ok = await UI.confirmDialog('Удалить курс «' + tree.course.title + '»?', 'Будут удалены все модули, темы, задания и прогресс. Действие необратимо.', 'Удалить');
        if (!ok) return;
        try {
          await Larpdeez.api('courses/' + encodeURIComponent(courseId), { method: 'DELETE' });
          await UI.loadCourses(true);
          location.href = '/courses.html';
        } catch (e) { UI.toast(e.message || 'Не удалось удалить курс', 'error'); }
      } });
    } else if (ent.kind === 'module') {
      items.push({ id: 'add-disc', label: 'Новая дисциплина', icon: 'plus', action: () => { entParent = id; editDiscipline(null, id); } });
      if (!ent.node.finalEnabled) {
        items.push({ id: 'final-on', label: 'Включить финальный проект', icon: 'flag', action: () => submitOps([{ op: 'final.enable', id, enabled: true }]) });
      } else {
        items.push({ id: 'final-edit', label: 'Финальный проект…', icon: 'flag', action: () => editFinal(id) });
        items.push({ id: 'final-off', label: 'Выключить финальный проект', icon: 'x', action: () => submitOps([{ op: 'final.enable', id, enabled: false }]) });
      }
      items.push({ sep: true });
      pushCommon();
    } else if (ent.kind === 'discipline') {
      items.push({ id: 'add-topic', label: 'Новая тема', icon: 'plus', action: () => { entParent = id; editTopic(null); } });
      items.push({ sep: true });
      pushCommon();
    } else if (ent.kind === 'topic') {
      items.push({ id: 'add-asg', label: 'Новое задание', icon: 'plus', action: () => { entParent = id; editAssignment(null); } });
      items.push({ id: 'toggle-done', label: ent.node.done ? 'Снять отметку пройденной' : 'Отметить пройденной', icon: ent.node.done ? 'rotate-ccw' : 'check', action: () => submitOps([{ op: 'topic.status', id, done: !ent.node.done }]) });
      items.push({ sep: true });
      pushCommon();
    } else if (ent.kind === 'assignment') {
      items.push({ id: 'toggle-done', label: ent.node.done ? 'Снять отметку выполнения' : 'Отметить выполненным', icon: ent.node.done ? 'rotate-ccw' : 'check', action: () => submitOps([{ op: 'assignment.status', id, done: !ent.node.done }]) });
      items.push({ sep: true });
      pushCommon();
    }
    function pushCommon() {
      items.push({ id: 'edit', label: 'Редактировать', icon: 'pencil', action: () => openEditor(ent) });
      items.push({ id: 'up', label: 'Выше', icon: 'move-up', disabled: firstSibling(id), action: () => moveSibling(id, -1) });
      items.push({ id: 'down', label: 'Ниже', icon: 'move-down', disabled: lastSibling(id), action: () => moveSibling(id, 1) });
      items.push({ sep: true });
      items.push({ id: 'del', label: 'Удалить', icon: 'trash-2', danger: true, action: () => deleteNode(id) });
    }
    UI.rowMenu(anchor, items);
  }
  function firstSibling(id) { const e = index[id]; if (!e || !e.siblings) return true; const a = e.siblings.slice().sort((x, y) => x.position - y.position); return a[0].id === id; }
  function lastSibling(id) { const e = index[id]; if (!e || !e.siblings) return true; const a = e.siblings.slice().sort((x, y) => x.position - y.position); return a[a.length - 1].id === id; }
  function openEditor(ent) {
    if (ent.kind === 'module') editModule(ent.node);
    else if (ent.kind === 'discipline') editDiscipline(ent.node);
    else if (ent.kind === 'topic') editTopic(ent.node);
    else if (ent.kind === 'assignment') editAssignment(ent.node);
  }

  let entParent = null; // контекст для «создать внутри»

  // ---------- Клики по дереву ----------
  treeScroll.addEventListener('click', (e) => {
    const twist = e.target.closest('[data-twist]');
    if (twist) {
      e.stopPropagation();
      const id = twist.dataset.twist;
      if (childIds(id).length) { collapsed[id] = !collapsed[id]; renderTree(); }
      return;
    }
    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) { e.stopPropagation(); nodeMenu(menuBtn.dataset.menu, menuBtn); return; }
    const row = e.target.closest('.tree-row');
    if (row) selectNode(row.dataset.id);
  });

  function selectNode(id) {
    selectedId = id;
    const ent = index[id];
    // Разворачиваем предков.
    let p = ent && ent.parentId;
    while (p) { collapsed[p] = false; p = index[p] ? index[p].parentId : null; }
    renderAll();
    history.replaceState(null, '', '/editor.html?course=' + encodeURIComponent(courseId) + (id ? '&node=' + encodeURIComponent(id) : ''));
  }

  // ---------- Отрисовка рабочей области ----------
  function renderWorkspace() {
    if (!tree) return;
    const ent = index[selectedId] || index[tree.course.id];
    if (!ent) { wsEl.innerHTML = '<div class="empty"><p>Элемент не найден.</p></div>'; return; }
    const id = ent.node.id;
    const kind = ent.kind;
    const n = ent.node;

    const toolbar = kind === 'course' ? `
        <button class="btn secondary small" data-ws="edit-course">${LD.icon('settings', 14)} Настройки</button>
        <button class="btn small" data-ws="add-module">${LD.icon('plus', 14)} Модуль</button>` : `
        <button class="icon-btn" data-ws="up" title="Выше" ${firstSibling(id) ? 'disabled' : ''}>${LD.icon('move-up', 15)}</button>
        <button class="icon-btn" data-ws="down" title="Ниже" ${lastSibling(id) ? 'disabled' : ''}>${LD.icon('move-down', 15)}</button>
        <button class="icon-btn" data-ws="edit" title="Редактировать">${LD.icon('pencil', 15)}</button>
        <button class="icon-btn" data-ws="del" title="Удалить">${LD.icon('trash-2', 15)}</button>`;

    let body = '';
    if (kind === 'course') {
      const st = tree.stats || {};
      body = `
        <p class="ws-desc mb-4">${esc(n.description) || '<span class="muted">Описание не заполнено.</span>'}</p>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-num">${st.progressPercent || 0}%</div><div class="stat-lbl">прогресс курса</div></div>
          <div class="stat-card"><div class="stat-num">${st.doneTopics || 0} / ${st.totalTopics || 0}</div><div class="stat-lbl">тем пройдено</div></div>
          <div class="stat-card"><div class="stat-num">${st.averageGrade == null ? '—' : st.averageGrade}</div><div class="stat-lbl">средний балл</div></div>
          <div class="stat-card"><div class="stat-num">${tree.modules.length}</div><div class="stat-lbl">модулей</div></div>
        </div>
        <div class="ws-section">
          <div class="ws-label">Модули</div>
          ${tree.modules.length ? tree.modules.map((m) => moduleMini(m)).join('') : `<div class="empty"><p>Модулей пока нет — создайте первый.</p></div>`}
        </div>`;
    } else if (kind === 'module') {
      const stats = (tree.stats && tree.stats.modules && tree.stats.modules.find((x) => x.id === n.id)) || {};
      body = `
        <p class="ws-desc mb-4">${esc(n.description) || ''}</p>
        ${(n.tags || []).length ? `<div class="mb-4 flex gap-2" style="flex-wrap:wrap">${n.tags.map((t) => `<span class="chip gray">#${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="stat-grid mb-4">
          <div class="stat-card"><div class="stat-num">${stats.progressPercent || 0}%</div><div class="stat-lbl">прогресс</div></div>
          <div class="stat-card"><div class="stat-num">${stats.doneTopics || 0} / ${stats.totalTopics || 0}</div><div class="stat-lbl">тем</div></div>
        </div>
        <div class="ws-section">
          <div class="ws-label">Дисциплины <button class="btn ghost small" data-ws="add-disc" style="margin-left:auto">${LD.icon('plus', 13)} Дисциплина</button></div>
          ${n.disciplines.length ? n.disciplines.map((d) => discMini(d)).join('') : `<div class="empty"><p>Дисциплин нет. Добавьте первую.</p></div>`}
        </div>
        ${finalSection(n)}`;
    } else if (kind === 'discipline') {
      const stats = disciplineStats(n.id);
      body = `
        <p class="ws-desc mb-4">${esc(n.description) || ''}</p>
        <div class="stat-grid mb-4">
          <div class="stat-card"><div class="stat-num">${stats.progressPercent}%</div><div class="stat-lbl">прогресс</div></div>
          <div class="stat-card"><div class="stat-num">${stats.doneTopics} / ${stats.totalTopics}</div><div class="stat-lbl">тем</div></div>
        </div>
        <div class="ws-section">
          <div class="ws-label">Темы <button class="btn ghost small" data-ws="add-topic" style="margin-left:auto">${LD.icon('plus', 13)} Тема</button></div>
          ${n.topics.length ? n.topics.map((t) => topicMini(t)).join('') : `<div class="empty"><p>Тем пока нет.</p></div>`}
        </div>`;
    } else if (kind === 'topic') {
      body = `
        <div class="ws-meta-row mb-4">
          ${n.date ? `<span>${LD.icon('calendar', 13)} ${esc(UI.fmtDateRu(n.date))} · ${esc(UI.dayOfWeekRu(n.date))}</span>` : '<span class="muted">Дата не указана</span>'}
          <button class="btn ghost small" data-ws="set-date">${LD.icon('calendar', 13)} Дата</button>
          <button class="btn ${n.done ? 'secondary' : ''} small" data-ws="toggle-done">${n.done ? LD.icon('rotate-ccw', 13) + ' Снять пройденное' : LD.icon('check', 13) + ' Пройдено'}</button>
        </div>
        <div class="ws-section">
          <div class="ws-label">Материал</div>
          <div class="ws-card"><div class="ws-content">${n.content ? esc(n.content) : '<span class="muted">Материал не заполнен. Нажмите «Редактировать», чтобы добавить конспект.</span>'}</div></div>
        </div>
        ${(n.links || []).length ? `<div class="ws-section"><div class="ws-label">Ссылки</div><div class="ws-card"><div class="link-list">${n.links.map((l, i) => `
          <div class="link-item">${LD.icon('link', 14)}<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a>
          <button class="icon-btn small li-remove" data-ws="rm-link" data-i="${i}" title="Убрать ссылку">${LD.icon('x', 13)}</button></div>`).join('')}</div></div></div>` : ''}
        <div class="ws-section">
          <div class="ws-label">Задания <button class="btn ghost small" data-ws="add-asg" style="margin-left:auto">${LD.icon('plus', 13)} Задание</button></div>
          ${n.assignments.length ? n.assignments.map((a) => asgCard(a)).join('') : `<div class="empty"><p>Заданий нет.</p></div>`}
        </div>`;
    } else if (kind === 'assignment') {
      body = `
        <div class="ws-meta-row mb-4">
          <button class="btn ${n.done ? 'secondary' : ''} small" data-ws="toggle-done">${n.done ? LD.icon('rotate-ccw', 13) + ' Снять выполнение' : LD.icon('check', 13) + ' Выполнено'}</button>
          <button class="btn ghost small" data-ws="grade">${LD.icon('award', 13)} ${n.grade == null ? 'Поставить оценку' : 'Изменить оценку: ' + n.grade}</button>
        </div>
        <div class="ws-section">
          <div class="ws-label">Описание</div>
          <div class="ws-card"><div class="ws-content">${n.description ? esc(n.description) : '<span class="muted">Описание не заполнено.</span>'}</div></div>
        </div>
        ${(n.criteria || []).length ? `<div class="ws-section"><div class="ws-label">Критерии <span class="muted small" style="text-transform:none;font-weight:400">отметка ведёт себя как чек-лист</span></div>
          <div class="ws-card"><ul class="crit-list">${n.criteria.map((c, i) => `<li class="crit-item" data-ws="crit" data-i="${i}"><span class="ci-box">${LD.icon('check', 11)}</span><span class="ci-text">${esc(c)}</span></li>`).join('')}</ul></div></div>` : ''}`;
    }
    wsEl.innerHTML = `
      <div class="ws-kind ${kind !== 'course' && ent.parentId ? '' : ''}">
        ${kind !== 'course' ? `<button class="icon-btn small" data-ws="back" title="К родителю">${LD.icon('arrow-left', 13)}</button>` : ''}
        ${KIND_ICON[kind] ? LD.icon(KIND_ICON[kind], 13) : ''} ${KIND_LABEL[kind]}${ent.parentId && index[ent.parentId] ? ' · ' + esc(index[ent.parentId].node.title) : ''}
      </div>
      <div class="ws-head">
        <h1 class="ws-title">${esc(n.title)}</h1>
        <div class="ws-toolbar">${toolbar}</div>
      </div>
      ${body}`;
  }

  function disciplineStats(discId) {
    for (const m of tree.modules) for (const d of m.disciplines) {
      if (d.id === discId) {
        const total = d.topics.length, done = d.topics.filter((t) => t.done).length;
        return { totalTopics: total, doneTopics: done, progressPercent: total ? Math.round(done / total * 100) : 0 };
      }
    }
    return { totalTopics: 0, doneTopics: 0, progressPercent: 0 };
  }

  function moduleMini(m) {
    const total = m.disciplines.reduce((s, d) => s + d.topics.length, 0);
    const done = m.disciplines.reduce((s, d) => s + d.topics.filter((t) => t.done).length, 0);
    const pct = total ? Math.round(done / total * 100) : 0;
    return `<div class="board-card" data-open="${m.id}" style="cursor:pointer">
      <div class="flex items-center gap-2"><b class="bc-title grow truncate">${esc(m.title)}</b><span class="small muted tabular">${done}/${total} · ${pct}%</span></div>
      <div class="progress-bar mt-2"><div style="width:${pct}%"></div></div>
    </div>`;
  }
  function discMini(d) {
    const done = d.topics.filter((t) => t.done).length;
    return `<div class="board-card" data-open="${d.id}" style="cursor:pointer">
      <div class="flex items-center gap-2"><b class="bc-title grow truncate">${esc(d.title)}</b><span class="small muted">${done}/${d.topics.length}</span></div>
    </div>`;
  }
  function topicMini(t) {
    return `<div class="board-card ${t.done ? '' : ''}" data-open="${t.id}" style="cursor:pointer">
      <div class="flex items-center gap-2">
        <span class="tree-ico" style="color:${t.done ? 'var(--success)' : 'var(--text-muted)'}">${LD.icon(t.done ? 'check-circle' : 'circle', 14)}</span>
        <b class="bc-title grow truncate ${t.done ? 'ac-done' : ''}" ${t.done ? 'style="text-decoration:line-through;color:var(--text-muted)"' : ''}>${esc(t.title)}</b>
        ${t.date ? `<span class="small muted">${esc(UI.fmtDateRu(t.date).replace(/ \d{4}$/, ''))}</span>` : ''}
        ${t.assignments.length ? `<span class="chip blue">${t.assignments.filter((a) => a.done).length}/${t.assignments.length}</span>` : ''}
      </div>
    </div>`;
  }
  function asgCard(a) {
    return `<div class="asg-card ${a.done ? 'ac-done' : ''}" data-open="${a.id}" style="cursor:pointer">
      <button class="icon-btn small" data-toggle-asg="${a.id}" title="${a.done ? 'Снять выполнение' : 'Отметить выполненным'}" style="margin-top:2px;color:${a.done ? 'var(--success)' : 'var(--text-muted)'}">${LD.icon(a.done ? 'check-circle' : 'circle', 16)}</button>
      <div class="ac-body">
        <div class="ac-title">${esc(a.title)}</div>
        ${a.description ? `<div class="ac-desc">${esc(a.description)}</div>` : ''}
        ${(a.criteria || []).length ? `<div class="small muted mt-2">${a.criteria.length} критер.</div>` : ''}
      </div>
      ${a.grade != null ? `<span class="grade-chip">${LD.icon('award', 12)} ${a.grade}</span>` : ''}
    </div>`;
  }
  function finalSection(m) {
    if (!m.finalEnabled) {
      return `<div class="ws-section"><div class="ws-label">Финальный проект</div>
        <div class="ws-card flex items-center gap-3"><span class="muted small grow">Вы можете включить финальный проект для этого модуля.</span>
        <button class="btn secondary small" data-ws="final-on">${LD.icon('flag', 13)} Включить</button></div></div>`;
    }
    const f = m.finalProject || { title: 'Финальный проект', status: 'todo', criteria: [], links: [], dueDate: '', grade: null };
    const overdue = f.dueDate && f.status !== 'done' && f.dueDate < UI.todayISO();
    return `<div class="ws-section"><div class="ws-label">Финальный проект</div>
      <div class="ws-card">
        <div class="flex items-center gap-3 mb-2" style="flex-wrap:wrap">
          <b>${esc(f.title)}</b>
          <div class="status-select" role="group">
            ${[['todo', 'Не начат'], ['in_progress', 'В работе'], ['done', 'Завершён']].map(([st, lbl]) =>
              `<button type="button" data-final-status="${st}" class="${f.status === st ? 'active-' + st : ''}">${lbl}</button>`).join('')}
          </div>
          ${f.dueDate ? `<span class="chip ${overdue ? 'red' : 'gray'}">${LD.icon('clock', 11)} срок ${esc(UI.fmtDateRu(f.dueDate))}</span>` : ''}
          ${f.grade != null ? `<span class="grade-chip">${LD.icon('award', 12)} ${f.grade}</span>` : ''}
          <button class="btn ghost small" data-ws="final-edit" style="margin-left:auto">${LD.icon('pencil', 13)} Изменить</button>
        </div>
        ${f.description ? `<p class="ws-desc mb-2">${esc(f.description)}</p>` : ''}
        ${(f.criteria || []).length ? `<ul class="crit-list">${f.criteria.map((c, i) =>
          `<li class="crit-item ${c.done ? 'done' : ''}" data-final-crit="${i}"><span class="ci-box">${LD.icon('check', 11)}</span><span class="ci-text">${esc(c.text)}</span></li>`).join('')}</ul>` : ''}
        ${(f.links || []).length ? `<div class="link-list mt-2">${f.links.map((l) => `<div class="link-item">${LD.icon('link', 13)}<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a></div>`).join('')}</div>` : ''}
      </div></div>`;
  }

  // ---------- Обработчики рабочей области ----------
  wsEl.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    const toggleAsg = e.target.closest('[data-toggle-asg]');
    const btn = e.target.closest('[data-ws]');
    const fcrit = e.target.closest('[data-final-crit]');
    const fstatus = e.target.closest('[data-final-status]');

    if (toggleAsg) {
      e.stopPropagation();
      const id = toggleAsg.dataset.toggleAsg;
      const a = index[id];
      try { await submitOps([{ op: 'assignment.status', id, done: !a.node.done }]); } catch (err) { UI.toast(err.message, 'error'); }
      return;
    }
    if (open) { selectNode(open.dataset.open); return; }

    if (fcrit) {
      // Критерии с состоянием done есть только у финального проекта модуля.
      const ent = index[selectedId];
      if (!ent || ent.kind !== 'module' || !ent.node.finalProject) return;
      const f = ent.node.finalProject;
      const i = Number(fcrit.dataset.finalCrit);
      const criteria = f.criteria.map((c, idx) => ({ text: c.text, done: idx === i ? !c.done : c.done }));
      try {
        await submitOps([{ op: 'final.update', id: ent.node.id, title: f.title, description: f.description, dueDate: f.dueDate, icon: f.icon, criteria, links: f.links, status: f.status, grade: f.grade }]);
      } catch (err) { UI.toast(err.message, 'error'); }
      return;
    }
    if (fstatus) {
      const ent = index[selectedId];
      if (!ent || ent.kind !== 'module') return;
      const m = ent.node;
      const f = m.finalProject || {};
      try {
        await submitOps([{ op: 'final.update', id: m.id, title: f.title, description: f.description, dueDate: f.dueDate, icon: f.icon, criteria: f.criteria, links: f.links, status: fstatus.dataset.finalStatus, grade: f.grade }]);
      } catch (err) { UI.toast(err.message, 'error'); }
      return;
    }
    if (!btn) return;
    const act = btn.dataset.ws;
    const ent = index[selectedId];
    const id = ent && ent.node.id;
    switch (act) {
      case 'back': if (ent && ent.parentId) selectNode(ent.parentId); break;
      case 'edit-course': {
        const r = await UI.editCourseDialog(tree.course);
        if (r) { await UI.loadCourses(true); await reload(); }
        break;
      }
      case 'add-module': editModule(null); break;
      case 'add-disc': entParent = id; editDiscipline(null, id); break;
      case 'add-topic': entParent = id; editTopic(null); break;
      case 'add-asg': entParent = id; editAssignment(null); break;
      case 'edit': if (ent) openEditor(ent); break;
      case 'del': if (ent) deleteNode(id); break;
      case 'up': moveSibling(id, -1); break;
      case 'down': moveSibling(id, 1); break;
      case 'toggle-done': {
        const op = ent.kind === 'topic' ? 'topic.status' : 'assignment.status';
        try { await submitOps([{ op, id, done: !ent.node.done }]); } catch (err) { UI.toast(err.message, 'error'); }
        break;
      }
      case 'set-date': {
        const inp = document.createElement('input');
        inp.type = 'date'; inp.value = ent.node.date || '';
        UI.dialog({
          title: 'Дата темы',
          fields: `<div class="field"><label>Дата <span class="muted small">(тема появится в календаре)</span></label><input class="input" type="date" name="date" value="${esc(ent.node.date || '')}"></div>`,
          onOk: async (v) => {
            const n2 = ent.node;
            await submitOps([{ op: 'topic.update', id, title: n2.title, content: n2.content, date: v.date || '', links: n2.links, color: n2.color }]);
            return true;
          },
        });
        break;
      }
      case 'grade': {
        await UI.dialog({
          title: 'Оценка задания',
          fields: `<div class="field"><label>Оценка <span class="muted small">(0–100, пусто — снять оценку)</span></label><input class="input" type="number" name="grade" min="0" max="100" value="${ent.node.grade == null ? '' : ent.node.grade}"></div>`,
          onOk: async (v) => {
            const g = v.grade === '' ? null : Number(v.grade);
            if (g !== null && (!Number.isFinite(g) || g < 0 || g > 100)) throw new Error('Оценка — число от 0 до 100.');
            const n2 = ent.node;
            await submitOps([{ op: 'assignment.update', id, title: n2.title, description: n2.description, criteria: n2.criteria, grade: g, color: n2.color }]);
            return true;
          },
        });
        break;
      }
      case 'rm-link': {
        const i = Number(btn.dataset.i);
        const links = ent.node.links.slice(); links.splice(i, 1);
        const n2 = ent.node;
        try { await submitOps([{ op: 'topic.update', id, title: n2.title, content: n2.content, date: n2.date, links, color: n2.color }]); } catch (err) { UI.toast(err.message, 'error'); }
        break;
      }
      case 'final-on': try { await submitOps([{ op: 'final.enable', id, enabled: true }]); } catch (err) { UI.toast(err.message, 'error'); } break;
      case 'final-edit': editFinal(id); break;
    }
  });

  // Быстрое редактирование названия: двойной клик по строке дерева
  treeScroll.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.tree-row');
    if (!row) return;
    const ent = index[row.dataset.id];
    if (ent && ent.kind !== 'course') openEditor(ent);
  });

  // ---------- Загрузка ----------
  async function reload() {
    tree = await UI.loadTree(courseId, true);
    reindex();
    if (selectedId && !index[selectedId]) selectedId = tree.course.id;
    if (!selectedId) selectedId = params.get('node') && index[params.get('node')] ? params.get('node') : tree.course.id;
    renderAll();
  }
  function renderAll() { renderTree(); renderWorkspace(); updateHeader(); }
  function updateHeader() {
    if (!tree) return;
    document.title = tree.course.title + ' — редактор — Larpdeez';
    const topbarTitle = document.querySelector('.topbar-title');
    if (topbarTitle) topbarTitle.textContent = tree.course.title;
  }

  // Переключатель курсов
  const switchEl = document.getElementById('course-switch');
  function fillSwitch() {
    const cs = UI.getCourses();
    switchEl.innerHTML = cs.map((c) => `<option value="${c.id}" ${c.id === courseId ? 'selected' : ''}>${esc(c.title)}</option>`).join('');
    switchEl.disabled = cs.length < 2;
  }
  switchEl.addEventListener('change', () => {
    courseId = switchEl.value; selectedId = '';
    history.replaceState(null, '', '/editor.html?course=' + encodeURIComponent(courseId));
    reload().catch(showLoadError);
  });

  document.getElementById('tree-search-lead').innerHTML = LD.icon('search', 14);
  const searchEl = document.getElementById('tree-search');
  searchEl.addEventListener('input', UI.debounce(() => { filterQ = searchEl.value.trim(); renderTree(); }, 120));

  function showLoadError(e) {
    wsEl.innerHTML = `<div class="empty"><div class="big">⚠️</div><p>${esc(e && e.message || 'Не удалось загрузить курс.')}</p>
      <a class="btn secondary" href="/courses.html">К списку курсов</a></div>`;
  }

  (async function init() {
    UI.renderShell('courses', { crumbs: [{ label: 'Курсы', href: '/courses.html' }, { label: 'Редактор' }] });
    try { await UI.loadSession(); } catch (e) { return; }
    const courses = UI.getCourses();
    if (!courses.length) {
      document.getElementById('tree-pane').style.display = 'none';
      wsEl.innerHTML = `<div class="empty"><div class="big">📚</div><p>Курсов пока нет. Создайте первый — и откроется редактор.</p>
        <button class="btn" id="ws-new-course">Создать курс</button></div>`;
      document.getElementById('ws-new-course').addEventListener('click', async () => {
        const id = await UI.newCourseDialog();
        if (id) location.href = '/editor.html?course=' + encodeURIComponent(id);
      });
      return;
    }
    if (!courseId || !courses.some((c) => c.id === courseId)) courseId = (courses.find((c) => c.isPrimary) || courses[0]).id;
    fillSwitch();
    try {
      await reload();
    } catch (e) { showLoadError(e); }
  })();
})();
