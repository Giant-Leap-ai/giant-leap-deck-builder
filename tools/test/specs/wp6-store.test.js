/* tools/test/specs/wp6-store.test.js — the store contract of spec §7.8: commit, undo and redo, selection, compile, events (WP6). */

function wp6With(body) {                         // open a throw-away project, run body(a, store, S), always close it
  return function (a) {
    return wp6Studio().then(function (S) {
      var proj = wp6Project();
      S.store.open(proj);
      var out;
      try { out = body(a, S.store, S, proj); } catch (e) { S.store.close(); throw e; }
      return Promise.resolve(out).then(function () { S.store.close(); }, function (e) { S.store.close(); throw e; });
    });
  };
}
function wp6Events(store, evt) { var seen = []; var off = store.on(evt, function (p) { seen.push(p); }); seen.off = off; return seen; }

T.test('wp6 store: commit clones, mutates the clone, and emits change with what changed', wp6With(function (a, store) {
  var before = store.get(), seen = wp6Events(store, 'change');
  var ok = store.commit('Edit B', function (d) { d.deck.scenes[1].props.line = 'Changed'; });
  a.equal(ok, true);
  a.ok(store.get() !== before, 'a new project object');
  a.equal(before.deck.scenes[1].props.line, 'Second scene', 'the old one was not touched');
  a.equal(store.get().deck.scenes[1].props.line, 'Changed');
  a.deepEqual(seen.length, 1);
  a.deepEqual({ ids: seen[0].changedSceneIds, theme: seen[0].themeChanged, structural: seen[0].structural }, { ids: ['b'], theme: false, structural: false });
  a.equal(seen[0].label, 'Edit B');
  a.ok(store.get().deck.meta.updated && !isNaN(Date.parse(store.get().deck.meta.updated)), 'meta.updated is stamped');
  a.equal(store.get().deck.meta.generator, 'studio@2.0.0');
  a.equal(store.get().deck.format, 2);
  seen.off();
}));

T.test('wp6 store: a commit that changes nothing is dropped', wp6With(function (a, store) {
  var seen = wp6Events(store, 'change');
  a.equal(store.commit('Nothing', function () { }), false);
  a.equal(store.commit('Same', function (d) { d.deck.scenes[0].props.line = 'First scene'; }), false);
  a.equal(seen.length, 0); a.equal(store.canUndo(), false);
  seen.off();
}));

T.test('wp6 store: the id of the project and the deck cannot be changed by a commit', wp6With(function (a, store, S, proj) {
  store.commit('Hack', function (d) { d.id = 'other'; d.deck.id = 'other'; d.deck.meta.title = 'T'; });
  a.equal(store.get().id, proj.id); a.equal(store.get().deck.id, proj.deck.id);
}));

T.test('wp6 store: same-label commits within a second are one undo step, other labels are separate', wp6With(function (a, store) {
  for (var i = 0; i < 12; i++) store.commit('Type', function (d) { d.deck.scenes[0].props.line = 'typing ' + i; });
  a.equal(store.get().deck.scenes[0].props.line, 'typing 11');
  store.commit('Notes', function (d) { d.deck.scenes[0].notes = 'n'; });
  store.undo();
  a.equal(store.get().deck.scenes[0].notes, 'one two three', 'one undo takes back the notes');
  store.undo();
  a.equal(store.get().deck.scenes[0].props.line, 'First scene', 'one more takes back all twelve keystrokes');
  a.equal(store.canUndo(), false);
  a.equal(store.canRedo(), true);
  store.redo(); a.equal(store.get().deck.scenes[0].props.line, 'typing 11');
  store.redo(); a.equal(store.get().deck.scenes[0].notes, 'n'); a.equal(store.canRedo(), false);
}));

T.test('wp6 store: undo keeps 100 steps, and a new commit drops the redo road', wp6With(function (a, store) {
  for (var i = 0; i < 130; i++) store.commit('Step ' + i, function (d) { d.deck.meta.subtitle = 's' + i; });
  var n = 0; while (store.canUndo() && n < 200) { store.undo(); n++; }
  a.equal(n, 100, 'the snapshot stack holds 100 entries');
  a.equal(store.get().deck.meta.subtitle, 's29', '130 commits, 100 steps back: the 30th state');
  store.redo(); store.redo();
  a.equal(store.canRedo(), true);
  store.commit('Fork', function (d) { d.deck.meta.subtitle = 'fork'; });
  a.equal(store.canRedo(), false);
  a.equal(store.redo(), false);
}));

T.test('wp6 store: undo and redo emit change with the same kind of payload, flagged', wp6With(function (a, store) {
  store.commit('Edit A', function (d) { d.deck.scenes[0].props.line = 'x'; });
  var seen = wp6Events(store, 'change');
  store.undo(); store.redo();
  a.equal(seen.length, 2);
  a.deepEqual(seen.map(function (e) { return e.undo; }), ['undo', 'redo']);
  a.deepEqual(seen[0].changedSceneIds, ['a']); a.deepEqual(seen[1].changedSceneIds, ['a']);
  seen.off();
}));

T.test('wp6 store: reorder, add and delete are structural; the theme change says so', wp6With(function (a, store) {
  var seen = wp6Events(store, 'change');
  store.commit('Move', function (d) { var s = d.deck.scenes.splice(2, 1)[0]; d.deck.scenes.unshift(s); });
  a.deepEqual({ ids: seen[0].changedSceneIds, st: seen[0].structural }, { ids: [], st: true }, 'a pure move changes no scene, only the order');
  store.commit('Add', function (d) { d.deck.scenes.push({ id: 'd', template: 'statement', props: { line: 'New' } }); });
  a.deepEqual({ ids: seen[1].changedSceneIds, st: seen[1].structural }, { ids: ['d'], st: true });
  store.commit('Delete', function (d) { d.deck.scenes.splice(1, 1); });
  a.equal(seen[2].structural, true);
  store.commit('Look', function (d) { d.deck.meta.theme = 'slate'; });
  a.equal(seen[3].themeChanged, true);
  store.commit('Patch', function (d) { d.deck.meta.themePatch = { roles: { accent: '#ff0000' } }; });
  a.equal(seen[4].themeChanged, true, 'a theme patch is a theme change too');
  seen.off();
}));

T.test('wp6 store: compiled() reuses every scene that did not change, by reference', wp6With(function (a, store) {
  var c1 = store.compiled();
  a.equal(c1.scenes.length, 3); a.equal(c1.errors.length, 0);
  a.equal(store.compiled(), c1, 'cached');
  store.commit('Edit B', function (d) { d.deck.scenes[1].props.line = 'Changed'; });
  var c2 = store.compiled();
  a.ok(c2 !== c1);
  a.equal(c2.scenes[0], c1.scenes[0], 'scene A is the same object'); a.equal(c2.scenes[2], c1.scenes[2], 'so is scene C');
  a.ok(c2.scenes[1] !== c1.scenes[1], 'B was expanded again');
  a.equal(c2.sceneKeys[0], c1.sceneKeys[0]); a.ok(c2.sceneKeys[1] !== c1.sceneKeys[1]);
  // a reorder re-expands nothing
  store.commit('Move', function (d) { d.deck.scenes.reverse(); });
  var c3 = store.compiled();
  a.deepEqual(c3.scenes.map(function (s) { return s.id; }), ['c', 'b', 'a']);
  a.equal(c3.scenes[0], c2.scenes[2]); a.equal(c3.scenes[2], c2.scenes[0]); a.equal(c3.scenes[1], c2.scenes[1]);
  // several commits before the next compiled(): the changes add up
  store.commit('E1', function (d) { d.deck.scenes[0].props.line = 'c1'; });
  store.commit('E2', function (d) { d.deck.scenes[2].props.line = 'a1'; });
  var c4 = store.compiled();
  a.ok(c4.scenes[0] !== c3.scenes[0] && c4.scenes[2] !== c3.scenes[2], 'both edits were picked up'); a.equal(c4.scenes[1], c3.scenes[1]);
  // a new scene in the middle, a theme change recompiles everything
  store.commit('Add', function (d) { d.deck.scenes.splice(1, 0, { id: 'n', template: 'statement', props: { line: 'Inserted' } }); });
  var c5 = store.compiled();
  a.deepEqual(c5.scenes.map(function (s) { return s.id; }), ['c', 'n', 'b', 'a']); a.equal(c5.scenes[0], c4.scenes[0]);
  store.commit('Look', function (d) { d.deck.meta.theme = 'slate'; });
  var c6 = store.compiled();
  a.ok(c6.themeKey !== c5.themeKey); a.ok(c6.scenes[0] !== c5.scenes[0], 'a new look expands every scene again');
  a.equal(c6.errors.length, 0);
  // the source of the compiled deck is the project's deck
  a.equal(c6.source.scenes.length, 4); a.equal(c6.meta.theme, 'slate');
}));

T.test('wp6 store: compile errors keep their scene index through incremental compiles', wp6With(function (a, store) {
  store.commit('Break', function (d) { d.deck.scenes[2].template = 'no-such-template'; });
  var c1 = store.compiled();
  a.deepEqual(c1.errors.map(function (e) { return e.scene + ':' + e.code; }), ['2:template.unknown']);
  store.commit('Insert', function (d) { d.deck.scenes.unshift({ id: 'z', template: 'statement', props: { line: 'First now' } }); });
  var c2 = store.compiled();
  a.deepEqual(c2.errors.map(function (e) { return e.scene + ':' + e.sceneId; }), ['3:c'], 'the error moved down one with its scene');
}));

T.test('wp6 store: selection is kept valid, emits select, and moves on when its scene is deleted', wp6With(function (a, store) {
  a.deepEqual(store.selection(), { sceneId: 'a', step: 0 }, 'the first scene is selected on open');
  var seen = wp6Events(store, 'select');
  store.select('b', 2);
  a.deepEqual(store.selection(), { sceneId: 'b', step: 2 }); a.deepEqual(seen[0], { sceneId: 'b', step: 2 });
  store.select('nope'); a.equal(store.selection().sceneId, 'b', 'an unknown scene is ignored');
  store.select('b', 2); a.equal(seen.length, 1, 'selecting the same thing again says nothing');
  store.commit('Delete', function (d) { d.deck.scenes.splice(1, 1); });
  a.equal(store.selection().sceneId, 'c', 'the selection moved to the scene that slid into its place: ' + JSON.stringify(store.selection()));
  store.select(null); a.deepEqual(store.selection(), { sceneId: null, step: 0 });
  a.equal(store.get().studio.selected.sceneId, null, 'it is part of the project (§7.8)');
  seen.off();
}));

T.test('wp6 store: a read-only project refuses every change', function (a) {
  return wp6Studio().then(function (S) {
    var p = wp6Project(); p.studio.readOnly = true;
    S.store.open(p);
    var seen = wp6Events(S.store, 'change');
    a.equal(S.store.commit('x', function (d) { d.deck.meta.title = 'no'; }), false);
    a.equal(S.store.undo(), false); a.equal(S.store.redo(), false); a.equal(S.store.canUndo(), false);
    a.equal(S.store.removeAsset('x'), false);
    a.equal(seen.length, 0); a.equal(S.store.get().deck.meta.title, 'Unit test deck');
    S.store.select('c'); a.equal(S.store.selection().sceneId, 'c', 'selecting is allowed: it is not an edit');
    return S.store.addFiles([new File(['x'], 'a.png', { type: 'image/png' })]).then(function (r) {
      a.equal(r.added.length, 0); a.equal(r.rejected[0].message, 'This deck is read-only.');
      S.store.setReadOnly(false); a.equal(S.store.commit('x', function (d) { d.deck.meta.title = 'yes'; }), true);
      seen.off(); S.store.close();
    });
  });
});

T.test('wp6 store: the One Giant Leap sample is the registered deck, read-only, and calibrates at 90 or more', function (a) {
  return wp6Studio().then(function (S) {
    var p = S.store.sampleProject('ogl');
    a.equal(p.studio.readOnly, true); a.equal(p.id, 'one-giant-leap'); a.equal(p.deck.scenes.length, 10);
    S.store.open(p);
    try {
      var c = S.store.compiled(), ref = PD.compile('one-giant-leap');
      a.equal(c.themeKey, ref.themeKey); a.equal(c.scenes.length, 10);
      a.ok(c.scenes.every(function (sc, i) { return sc === ref.scenes[i]; }), 'the very scene objects the player uses (raw scenes pass by reference)');
      var l = S.store.lint();
      a.ok(l.score >= 90 && l.ready, 'score ' + l.score);
      a.equal(S.store.get().studio.selected.sceneId, 'spark');
    } finally { S.store.close(); }
  });
});

T.test('wp6 store: the template replica is an editable copy with its own id', function (a) {
  return wp6Studio().then(function (S) {
    var p = S.store.sampleProject('replica');
    a.notEqual ? a.notEqual(p.id, 'parity') : a.ok(p.id !== 'parity');
    a.ok(/^one-giant-leap-template-replica-[a-z0-9]{4}$/.test(p.id), p.id);
    a.equal(p.deck.id, p.id); a.equal(p.studio.readOnly, false); a.equal(p.deck.scenes.length, 10);
    a.ok(p.deck.scenes.every(function (s) { return typeof s.template === 'string'; }));
    a.equal(PD.compile('parity').source.id, 'parity', 'the registered replica was not touched');
    a.equal(p.deck.meta.generator, 'studio@2.0.0');
  });
});

T.test('wp6 store: answer() writes the story, suggests a look from the tone, and names the deck after the brand', wp6With(function (a, store) {
  store.answer('tone', 'crisp');
  a.equal(store.get().deck.meta.theme, 'slate', 'anything but cinematic suggests Slate');
  store.answer('tone', 'cinematic');
  a.equal(store.get().deck.meta.theme, 'cosmos');
  store.commit('Choose', function (d) { d.studio.themeChosen = true; d.deck.meta.theme = 'slate'; });
  store.answer('tone', 'cinematic');
  a.equal(store.get().deck.meta.theme, 'slate', 'a look the author chose is never overruled');
  store.answer('bigIdea', 'Always say it in one breath please');
  a.equal(store.get().deck.meta.title, 'Always say it in one', 'no brand and no short idea: the first words');
  store.answer('shortIdea', 'One breath');
  a.equal(store.get().deck.meta.title, 'One breath');
  store.answer('brand', { brand: 'Northwind', tagline: 'Human work' });
  a.equal(store.get().deck.meta.title, 'Northwind');
  a.equal(store.get().deck.meta.story.tagline, 'Human work');
  store.commit('Rename', function (d) { d.deck.meta.title = 'My title'; d.studio.titleAuto = false; });
  store.answer('brand', { brand: 'Other', tagline: '' });
  a.equal(store.get().deck.meta.title, 'My title', 'a name the author typed stays');
  store.answer('targetMin', '12.4');
  a.equal(store.get().deck.meta.story.targetMin, 12);
  store.answer('targetMin', 500); a.equal(store.get().deck.meta.story.targetMin, 90, 'clamped to 90');
  store.answer('proof', [{ kind: 'number', text: 'x', value: '62' }, { kind: 'bogus', text: 'y' }, { kind: 'story', text: '' }]);
  a.deepEqual(store.get().deck.meta.story.proof, [{ kind: 'number', text: 'x', value: 62 }, { kind: 'story', text: 'y' }], 'sanitized by the interview');
}));

T.test('wp6 store: a project is saved when it matches its last saved hash, and undo can make it so again', wp6With(function (a, store) {
  a.equal(store.isSaved(), false, 'never saved');
  store.markSaved({ fileName: 'x.html' });
  a.equal(store.isSaved(), true); a.equal(store.get().studio.fileName, 'x.html');
  a.ok(!isNaN(Date.parse(store.get().studio.savedAt)));
  store.commit('Edit', function (d) { d.deck.scenes[0].props.line = 'changed'; });
  a.equal(store.isSaved(), false, 'a change makes the file out of date');
  store.undo();
  a.equal(store.isSaved(), true, 'back to the saved state');
  store.select('b'); a.equal(store.isSaved(), true, 'selecting is not a change');
  store.patchStudio({ screen: 'look' }); a.equal(store.isSaved(), true, 'neither is a studio field');
}));

T.test('wp6 store: route() navigates, emits route, and marks screens visited', wp6With(function (a, store) {
  var seen = wp6Events(store, 'route');
  a.equal(store.route(), 'welcome');
  a.equal(store.route('look'), 'look');
  a.deepEqual(seen.slice(), ['look']);
  a.equal(store.get().studio.screen, 'look'); a.equal(store.get().studio.visited.look, 1);
  store.route('look'); a.equal(seen.length, 1, 'no event when nothing changed');
  store.route('board'); a.equal(store.get().studio.visited.board, 1); a.equal(store.get().studio.visited.look, 1);
  store.route('welcome'); a.equal(store.get().studio.screen, 'board', 'the welcome screen is not a place in the project');
  seen.off();
}));

T.test('wp6 store: lint is cached, recomputed after a change, and the timing lands later', function (a) {
  return wp6Studio().then(function (S) {
    var proj = wp6Project(); S.store.open(proj);
    var store = S.store, l1 = store.lint();
    a.ok(l1 && Array.isArray(l1.findings) && typeof l1.score === 'number' && typeof l1.ready === 'boolean');
    a.equal(store.lint(), l1, 'cached');
    a.equal(store.timing(), null, 'no timing yet');
    var lints = wp6Events(store, 'lint'), timings = wp6Events(store, 'timing');
    store.commit('Edit', function (d) { d.deck.scenes[0].props.line = 'Different words here'; });
    a.equal(store.lint(), l1, 'unchanged until 300 ms have passed');
    return new Promise(function (r) { setTimeout(r, 500); }).then(function () {
      a.ok(lints.length >= 1, 'a lint event came after the change');
      a.ok(store.lint() !== l1);
      store.route('board');                     // timing runs where it matters: the board, rehearse and export
      return new Promise(function (resolve, reject) {
        var t0 = Date.now();
        (function wait() { if (timings.length) return resolve(); if (Date.now() - t0 > 20000) return reject(new Error('no timing within 20 s')); setTimeout(wait, 100); })();
      });
    }).then(function () {
      var t = store.timing();
      a.ok(t && t.total > 0 && t.scenes.length === 3, 'a Timing for 3 scenes');
      lints.off(); timings.off(); store.close();
    }, function (e) { lints.off(); timings.off(); store.close(); throw e; });
  });
});

T.test('wp6 store: adding files commits the asset map, and undo takes the asset out of the deck again', function (a) {
  return wp6Studio().then(function (S) {
    var proj = wp6Project(), store = S.store, id = proj.deck.id;
    store.open(proj);
    return wp6Canvas(300, 200, 'Pic One.png', 'image/png').then(function (f) { return store.addFiles([f]); }).then(function (r) {
      a.deepEqual(r.added.map(function (x) { return x.id; }), ['pic-one']);
      a.deepEqual(Object.keys(store.get().assets), ['pic-one']); a.ok(/^[0-9a-f]{64}$/.test(store.get().assets['pic-one']));
      a.ok(PD.assets.get(id)['pic-one'], 'registered for the engine');
      a.equal(store.canUndo(), true);
      store.undo();
      a.deepEqual(store.get().assets, {}); a.equal(PD.assets.get(id)['pic-one'], undefined, 'and gone from the engine');
      store.redo();
      a.ok(PD.assets.get(id)['pic-one'], 'redo brings it back from memory: the record was cached');
      a.equal(store.removeAsset('pic-one'), true);
      a.deepEqual(store.get().assets, {}); a.equal(PD.assets.get(id)['pic-one'], undefined);
      a.equal(store.removeAsset('pic-one'), false, 'removing what is not there is a no-op');
      store.close();
    }, function (e) { store.close(); throw e; });
  });
});

T.test('wp6 store: a scene that names an asset is expanded again when that asset changes', function (a) {
  return wp6Studio().then(function (S) {
    var proj = wp6Project(), store = S.store;
    proj.deck.scenes.push({ id: 'img', template: 'image', props: { asset: 'pic-two', fit: 'contain' } });
    store.open(proj);
    var c1 = store.compiled();
    return wp6Canvas(300, 200, 'Pic Two.png', 'image/png').then(function (f) { return store.addFiles([f]); }).then(function () {
      var c2 = store.compiled();
      a.ok(c2.scenes[3] !== c1.scenes[3], 'the picture arrived, so the scene that uses it was built again');
      a.equal(c2.scenes[0], c1.scenes[0], 'the others were not');
      store.close();
    }, function (e) { store.close(); throw e; });
  });
});

T.test('wp6 store: a font the browser cannot read never becomes the brand font', function (a) {
  return wp6Studio().then(function (S) {
    var proj = wp6Project(), store = S.store, id = proj.deck.id;
    store.open(proj);
    PD.assets.put(id, 'my-font', { type: 'font', src: 'data:font/ttf;base64,AAAA', family: 'Wrong', name: 'f.ttf', bytes: 3 });
    return store.setBrandFont('my-font', 'Brand "Sans"').then(function (ok) {
      a.equal(ok, false, 'the face must load before the deck is compiled against it');
      a.equal(store.get().deck.meta.themePatch, undefined, 'and the deck is untouched');
      return store.setBrandFont('missing');
    }).then(function (ok) {
      a.equal(ok, false, 'an unknown asset is refused');
      return store.setBrandFont(null);
    }).then(function (ok) { a.equal(ok, true, 'clearing is always fine'); a.equal(store.brandFont(), null); PD.assets.remove(id, 'my-font'); store.close(); }, function (e) { store.close(); throw e; });
  });
});

T.test('wp6 store: the shell reports progress with the rules of §7.2', function (a) {
  return wp6Studio().then(function (S) {
    var blank = S.store.blankProject('Progress'), done = function (n, p) { return S.app.doneOf(n, p); };
    blank.studio.sample = 'unit-test';
    a.equal(done(1, blank), false, 'a blank brief is not done');
    var p1 = JSON.parse(JSON.stringify(blank)); p1.deck.meta.story.bigIdea = 'An idea'; p1.deck.meta.story.targetMin = 5;
    a.equal(done(1, p1), true, 'done when bigIdea and targetMin are set');
    p1.deck.meta.story.targetMin = null; a.equal(done(1, p1), false);
    var p2 = wp6Project(); p2.studio.sample = 'unit-test';
    a.equal(done(2, p2), true, 'shape: scenes exist and a framework is set');
    a.equal(done(3, p2), false, 'look: not visited'); p2.studio.visited = { look: 1 }; a.equal(done(3, p2), true);
    a.equal(done(5, p2), false); p2.studio.visited.rehearse = 1; a.equal(done(5, p2), true);
    a.equal(done(6, blank), false, 'never saved');
  });
});

T.test('wp6 store: autosave waits one second, writes the project and its index entry, and skips a deck nobody has written into', function (a) {
  return wp6Studio().then(function (S) {
    var store = S.store, proj = store.blankProject('Autosave test'), id = proj.id, pers = S.persist;
    var inIndex = function () { return pers.index().some(function (e) { return e.id === id; }); };
    store.open(proj);
    var states = wp6Events(store, 'status');
    store.route('brief'); store.patchStudio({ briefAt: 3 });
    return new Promise(function (r) { setTimeout(r, 1300); }).then(function () {
      a.equal(inIndex(), false, 'a blank deck is not put in the Continue list');
      a.equal(store.saveState().state, 'idle');
      store.answer('bigIdea', 'Say it in one breath');
      a.equal(store.saveState().state, 'pending', 'a change makes the autosave pending');
      return new Promise(function (r) { setTimeout(r, 500); });
    }).then(function () {
      a.equal(inIndex(), false, 'still waiting: the autosave is 1 s after the last commit');
      store.answer('bigIdea', 'Say it in one breath, please');
      return new Promise(function (r) { setTimeout(r, 1300); });
    }).then(function () {
      a.equal(inIndex(), true, 'now it is saved');
      a.equal(store.saveState().state, 'saved');
      var back = pers.loadProject(id);
      a.equal(back.deck.meta.story.bigIdea, 'Say it in one breath, please'); a.equal(back.studio.briefAt, 3);
      a.ok(states.some(function (s) { return s.state === 'pending'; }) && states.some(function (s) { return s.state === 'saved'; }), 'status events: pending, then saved');
      states.off(); store.close(); pers.removeProject(id);
    }, function (e) { states.off(); store.close(); pers.removeProject(id); throw e; });
  });
});
