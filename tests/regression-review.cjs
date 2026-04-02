const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadModule(filePath, imports = {}, extraContext = {}) {
  let source = fs.readFileSync(filePath, 'utf8');
  const exportNames = [];

  source = source.replace(
    /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?$/gm,
    (_, names, spec) => `const {${names}} = __imports[${JSON.stringify(spec)}];`
  );
  source = source.replace(
    /^import\s+([A-Za-z0-9_$]+)\s+from\s+['"]([^'"]+)['"];?$/gm,
    (_, name, spec) =>
      `const ${name} = (__imports[${JSON.stringify(spec)}] && (__imports[${JSON.stringify(spec)}].default ?? __imports[${JSON.stringify(spec)}]));`
  );
  source = source.replace(/^export function\s+([A-Za-z0-9_$]+)\s*\(/gm, (_, name) => {
    exportNames.push(name);
    return `function ${name}(`;
  });
  source = source.replace(/^export const\s+([A-Za-z0-9_$]+)\s*=/gm, (_, name) => {
    exportNames.push(name);
    return `const ${name} =`;
  });
  source = source.replace(/^export default\s+([A-Za-z0-9_$]+);?$/gm, (_, name) => `exports.default = ${name};`);
  source += `\n${exportNames.map((name) => `exports.${name} = ${name};`).join('\n')}\n`;

  const context = {
    exports: {},
    module: { exports: {} },
    __imports: imports,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...extraContext,
  };

  vm.createContext(context);
  new vm.Script(source, { filename: filePath }).runInContext(context);
  return context.exports;
}

class MockElement {
  constructor(tagName, registry) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.registry = registry;
    this.children = [];
    this.parentNode = null;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.style = { setProperty: () => {} };
    this._innerHTML = '';
    this.className = '';
    this.classList = {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false,
    };
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === '') {
      this.children = [];
      return;
    }
    // Parse tags with id and/or class, register them as child elements
    const tagRegex = /<(\w+)([^>]*)>/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(value)) !== null) {
      const attrs = tagMatch[2];
      const idMatch = attrs.match(/id="([^"]+)"/);
      const classMatch = attrs.match(/class="([^"]+)"/);
      if (idMatch) {
        const el = new MockElement(tagMatch[1], this.registry);
        if (classMatch) el.className = classMatch[1];
        this.registry[idMatch[1]] = el;
        this.appendChild(el);
      }
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }

  replaceWith(newNode) {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) {
        this.parentNode.children[idx] = newNode;
        newNode.parentNode = this.parentNode;
      }
    }
  }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      for (const child of this.children) {
        if (child.className && child.className.split(' ').includes(className)) {
          return child;
        }
      }
    }
    if (selector === '.empty-row' && this._innerHTML.includes('empty-row')) {
      return {
        remove: () => {
          this._innerHTML = '';
        },
      };
    }
    return null;
  }

  closest(selector) {
    if (selector === '.table-container') {
      return {
        scrollHeight: 100,
        scrollTo: () => {},
      };
    }
    return null;
  }

  addEventListener() {}

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 20, bottom: 20 };
  }
}

function createDocument() {
  const elements = {};
  const body = new MockElement('body', elements);

  const document = {
    body,
    createElement: (tagName) => new MockElement(tagName, elements),
    getElementById: (id) => elements[id] || null,
    querySelector: (selector) => {
      if (selector === '#draw-result-table tbody') return elements.drawResultTbody;
      return null;
    },
    register(id, element) {
      elements[id] = element;
      return element;
    },
  };

  return document;
}

function createDrawPageDom() {
  const document = createDocument();

  document.register('groups-container', new MockElement('div', document.body.registry || {}));
  document.register('group-count', new MockElement('input', document.body.registry || {})).value = '2';
  document.register('start-draw-btn', new MockElement('button', document.body.registry || {}));
  document.register('reset-draw-btn', new MockElement('button', document.body.registry || {})).disabled = true;
  document.register('final-export-btn', new MockElement('button', document.body.registry || {})).disabled = true;
  document.register('export-btn', new MockElement('button', document.body.registry || {})).disabled = true;
  document.register('draw-slot', new MockElement('div', document.body.registry || {}));
  document.register('draw-status-label', new MockElement('div', document.body.registry || {}));
  document.register('draw-status-count', new MockElement('div', document.body.registry || {}));
  document.register('draw-result-table', new MockElement('table', document.body.registry || {}));
  const tbody = new MockElement('tbody', document.body.registry || {});
  tbody.innerHTML = '<tr class="empty-row"><td colspan="4">请先开始抽签</td></tr>';
  document.drawResultTbody = tbody;
  document.register('drawResultTbody', tbody);

  return document;
}

function createSettingsDom(groupCountValue) {
  const document = createDocument();
  const input = new MockElement('input', document.body.registry || {});
  input.value = String(groupCountValue);
  document.register('group-count', input);
  return document;
}

const root = path.join(__dirname, '..');
const drawAlgorithmModule = loadModule(path.join(root, 'draw-algorithm.js'));
const DrawAlgorithm = drawAlgorithmModule.default;
const animationHelpers = loadModule(path.join(root, 'src/animation-helpers.js'));

function testRestoreRebuildsGroups() {
  const teams = [
    { teamName: 'Alpha', school: 'A', isSeeded: true, group: 1, drawOrder: 1 },
    { teamName: 'Beta', school: 'B', isSeeded: false, group: 2, drawOrder: 2 },
    { teamName: 'Gamma', school: 'C', isSeeded: false, group: 0, drawOrder: 3 },
  ];
  const algorithm = new DrawAlgorithm(teams, 2);

  algorithm.restore();

  const groups = algorithm.getGroups();
  assert.strictEqual(groups[0].teams.length, 1, 'group A should be restored');
  assert.strictEqual(groups[1].teams.length, 1, 'group B should be restored');
  assert.strictEqual(algorithm.remainingTeams.length, 1, 'undrawn team should remain pending');
  assert.strictEqual(groups[0].teams[0].teamName, 'Alpha');
  assert.strictEqual(groups[1].teams[0].teamName, 'Beta');
}

function testStartDrawAnimationContinuesFlowAndPreservesDrawOrder() {
  const store = {
    teamsData: [
      { id: 1, teamName: 'Seed-B', school: 'B', isSeeded: true, drawOrder: 2, group: 0 },
      { id: 2, teamName: 'Seed-A', school: 'A', isSeeded: true, drawOrder: 1, group: 0 },
      { id: 3, teamName: 'Team-C', school: 'C', isSeeded: false, drawOrder: 3, group: 0 },
    ],
    drawAlgorithm: null,
    drawCompleted: false,
    drawCount: 0,
    currentProject: 'project-1',
    projectsData: { 'project-1': { drawCompleted: false, drawOrderGenerated: true, groupCount: 2 } },
  };
  const document = createDrawPageDom();
  const drawPage = loadModule(
    path.join(root, 'src/draw-page.js'),
    {
      './store.js': { store },
      './dialog.js': { showAlertDialog: () => {}, showConfirmDialog: () => {} },
      './utils.js': { escapeHtml: (value) => String(value) },
      './events.js': { eventBus: { on: () => {}, off: () => {}, emit: () => {} } },
      './animation.js': { flyElement: () => {}, flashRandomNames: () => {} },
      './animation-helpers.js': animationHelpers,
      '../draw-algorithm.js': { default: DrawAlgorithm },
    },
    {
      document,
      window: {},
      requestAnimationFrame: () => 1,
    }
  );

  drawPage.startDrawAnimation();

  assert.ok(store.drawAlgorithm, 'first click should initialize draw algorithm');
  assert.strictEqual(store.drawAlgorithm.remainingTeams.length, 1, 'only seeded teams should be allocated on first click');
  assert.strictEqual(store.teamsData[0].drawOrder, 2, 'seeded team draw order must not be rewritten');
  assert.strictEqual(store.teamsData[1].drawOrder, 1, 'seeded team draw order must remain original');

  // Second click pauses (unified with order-page pause/resume pattern)
  drawPage.startDrawAnimation();

  // Verify algorithm can draw remaining team directly
  const result = store.drawAlgorithm.drawOne();
  assert.ok(result, 'algorithm should be able to draw remaining team');
  assert.strictEqual(result.team.drawOrder, 3, 'remaining team draw order preserved');
  assert.strictEqual(store.drawAlgorithm.remainingTeams.length, 0, 'all teams drawn');
}

function testUpdateGroupCountClearsExistingGroups() {
  const store = {
    teamsData: [
      { teamName: 'Alpha', group: 1 },
      { teamName: 'Beta', group: 2 },
      { teamName: 'Gamma', group: 0 },
      { teamName: 'Delta', group: 1 },
      { teamName: 'Epsilon', group: 2 },
      { teamName: 'Zeta', group: 0 },
    ],
    drawAlgorithm: {},
    drawCompleted: true,
    currentProject: 'project-1',
    projectsData: { 'project-1': { groupCount: 2, drawCompleted: true } },
  };
  const document = createSettingsDom(3);
  const settingsPage = loadModule(
    path.join(root, 'src/settings-page.js'),
    {
      './store.js': { store },
      './dialog.js': { showAlertDialog: () => {}, showPromptDialog: (msg, defaultVal, cb) => { if (cb) cb('3'); } },
      './navigation.js': { updateNavigationState: () => {}, updatePageHeaders: () => {} },
      './utils.js': { escapeHtml: (value) => String(value) },
      './events.js': { eventBus: { on: () => {}, off: () => {}, emit: () => {} } },
      './order-page.js': { stopOrderAnimation: () => {} },
      './draw-page.js': { stopDrawAnimation: () => {} },
      '../draw-algorithm.js': { default: DrawAlgorithm },
    },
    {
      document,
      window: {},
    }
  );

  settingsPage.updateGroupCount();

  assert.strictEqual(store.projectsData['project-1'].groupCount, 3, 'new group count should be stored');
  assert.strictEqual(store.drawCompleted, false, 'draw state should be invalidated');
  assert.strictEqual(store.drawAlgorithm, null, 'draw algorithm should be cleared');
  assert.deepStrictEqual(
    store.teamsData.map((team) => team.group),
    [0, 0, 0, 0, 0, 0],
    'existing group assignments should be cleared'
  );
}

function testUpdateGroupCountClearsDrawOrderState() {
  // Bug: after full draw completion, re-grouping must clear drawOrderState
  // so the order page can generate a new draw order
  const store = {
    teamsData: [
      { teamName: 'Alpha', school: 'A', isSeeded: true, group: 1, drawOrder: 1 },
      { teamName: 'Beta', school: 'B', isSeeded: false, group: 2, drawOrder: 2 },
      { teamName: 'Gamma', school: 'C', isSeeded: false, group: 1, drawOrder: 3 },
      { teamName: 'Delta', school: 'D', isSeeded: false, group: 2, drawOrder: 4 },
    ],
    drawAlgorithm: {},
    drawCompleted: true,
    currentProject: 'project-1',
    projectsData: { 'project-1': { groupCount: 2, drawCompleted: true, drawOrderGenerated: true, drawOrderSequence: [{ teamName: 'Alpha' }, { teamName: 'Beta' }], drawOrderProgress: 4 } },
    drawOrderState: { isComplete: true, isPaused: false },
    isGeneratingOrder: false,
  };
  let stopOrderCalled = false;
  const document = createSettingsDom(2);
  const settingsPage = loadModule(
    path.join(root, 'src/settings-page.js'),
    {
      './store.js': { store },
      './dialog.js': { showAlertDialog: () => {}, showPromptDialog: (msg, defaultVal, cb) => { if (cb) cb('2'); } },
      './navigation.js': { updateNavigationState: () => {}, updatePageHeaders: () => {} },
      './utils.js': { escapeHtml: (value) => String(value) },
      './events.js': { eventBus: { on: () => {}, off: () => {}, emit: () => {} } },
      './order-page.js': { stopOrderAnimation: () => { stopOrderCalled = true; store.drawOrderState = null; store.isGeneratingOrder = false; } },
      './draw-page.js': { stopDrawAnimation: () => {} },
      '../draw-algorithm.js': { default: DrawAlgorithm },
    },
    {
      document,
      window: {},
    }
  );

  settingsPage.updateGroupCount();

  assert.ok(stopOrderCalled, 'stopOrderAnimation should be called when re-grouping');
  assert.strictEqual(store.drawOrderState, null, 'drawOrderState must be cleared so order page can regenerate');
  assert.strictEqual(store.isGeneratingOrder, false, 'isGeneratingOrder must be reset');
  assert.strictEqual(store.projectsData['project-1'].drawOrderGenerated, false, 'drawOrderGenerated must be reset');
  assert.strictEqual(store.projectsData['project-1'].drawOrderSequence, null, 'drawOrderSequence must be cleared');
  assert.deepStrictEqual(
    store.teamsData.map((t) => t.drawOrder),
    [0, 0, 0, 0],
    'all team draw orders must be reset'
  );
}

const tests = [
  ['restore rebuilds saved groups', testRestoreRebuildsGroups],
  ['startDrawAnimation continues draw flow and preserves draw order', testStartDrawAnimationContinuesFlowAndPreservesDrawOrder],
  ['updateGroupCount clears stale groups', testUpdateGroupCountClearsExistingGroups],
  ['updateGroupCount clears drawOrderState for re-grouping', testUpdateGroupCountClearsDrawOrderState],
];

let failures = 0;
for (const [name, testFn] of tests) {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
