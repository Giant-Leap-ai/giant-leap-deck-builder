/* tools/test/specs/wp6-persist.test.js — ids, localStorage, IndexedDB, the tab lock and the file target (spec §7.7, WP6). */

T.test('wp6 persist: slug and newId follow the deck id rule', function (a) {
  return wp6Studio().then(function (S) {
    var p = S.persist;
    a.equal(p.slug('Q4 Board Story!'), 'q4-board-story');
    a.equal(p.slug('  Ünïcode   déjà vu  '), 'unicode-deja-vu');
    a.equal(p.slug('---'), '');
    a.equal(p.slug('abcdefghij', 5), 'abcde');
    a.equal(p.slug('ab cd-ef', 4), 'ab-c');
    for (var i = 0; i < 40; i++) {
      var id = p.newId('The Quick Brown Fox Jumps Over The Lazy Dog And Then Some More Words To Fill The Space');
      a.ok(/^[a-z0-9][a-z0-9-]{0,47}$/.test(id), id);
      a.ok(/-[a-z0-9]{4}$/.test(id), 'ends in 4 base36 characters: ' + id);
    }
    a.ok(/^untitled-[a-z0-9]{4}$/.test(p.newId('')), 'an empty title is "untitled"');
    a.ok(/^untitled-[a-z0-9]{4}$/.test(p.newId('!!!')), 'so is one with nothing to slug');
    var seen = {}; for (var j = 0; j < 200; j++) seen[p.newId('x')] = 1;
    a.ok(Object.keys(seen).length > 190, 'random enough: ' + Object.keys(seen).length + ' of 200 distinct');
    var taken = []; for (var k = 0; k < 30; k++) { var n = p.newId('same', taken); a.ok(taken.indexOf(n) < 0); taken.push(n); }
  });
});

T.test('wp6 persist: sha256 matches the known digest', function (a) {
  return wp6Studio().then(function (S) {
    return S.persist.sha256('abc').then(function (h) {
      a.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      return S.persist.sha256('');
    }).then(function (h) { a.equal(h, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'); });
  });
});

T.test('wp6 persist: a project round-trips through localStorage, and the index follows', function (a) {
  return wp6Studio().then(function (S) {
    var p = S.persist, proj = S.store.blankProject('Persist test'), id = proj.id;
    proj.studio.readOnly = true; proj.studio.registeredId = 'x'; proj.studio.lockedByOther = true; proj.studio.sample = 'ogl';
    proj.deck.scenes = [{ id: 'a', template: 'statement', props: { line: 'Hi' } }];
    try {
      var r = p.saveProject(proj);
      a.equal(r.ok, true);
      var back = p.loadProject(id);
      a.deepEqual(back.deck, proj.deck, 'the deck is the same');
      a.equal(back.studio.readOnly, false, 'read-only is never stored');
      a.ok(!('registeredId' in back.studio) && !('lockedByOther' in back.studio) && !('sample' in back.studio), 'neither are the sample markers');
      var e = p.index().filter(function (x) { return x.id === id; })[0];
      a.ok(e && e.title === 'Persist test' && e.theme === 'cosmos' && e.scenes === 1 && !isNaN(Date.parse(e.updated)), 'index entry: ' + JSON.stringify(e));
      a.equal(p.index()[0].id, id, 'the most recent is first');
      a.equal(localStorage.getItem('pdstudio:v1:proj:' + id) != null, true, 'under the documented key');
      a.ok(Array.isArray(JSON.parse(localStorage.getItem('pdstudio:v1:index'))), 'and the documented index key');
      p.removeProject(id);
      a.equal(p.loadProject(id), null); a.equal(p.index().some(function (x) { return x.id === id; }), false);
    } finally { p.removeProject(id); }
  });
});

T.test('wp6 persist: loading is defensive about what storage holds', function (a) {
  return wp6Studio().then(function (S) {
    var p = S.persist;
    localStorage.setItem('pdstudio:v1:proj:wp6-junk', '{not json');
    a.equal(p.loadProject('wp6-junk'), null, 'broken JSON');
    localStorage.setItem('pdstudio:v1:proj:wp6-junk', JSON.stringify({ id: 'wp6-junk' }));
    a.equal(p.loadProject('wp6-junk'), null, 'no deck');
    localStorage.setItem('pdstudio:v1:proj:wp6-junk', JSON.stringify({ id: 'wp6-junk', deck: { scenes: [] } }));
    var q = p.loadProject('wp6-junk');
    a.ok(q && q.v === 1 && q.assets && q.studio.screen === 'brief' && q.studio.selected.sceneId === null && q.deck.meta, 'a bare project is completed to the §7.8 shape');
    var idx = localStorage.getItem('pdstudio:v1:index');
    localStorage.setItem('pdstudio:v1:index', JSON.stringify([{ id: 'ok', title: 'T' }, 5, null, { id: 3 }]));
    a.deepEqual(p.index().map(function (e) { return e.id; }), ['ok'], 'bad index entries are dropped');
    localStorage.removeItem('pdstudio:v1:proj:wp6-junk');
    if (idx == null) localStorage.removeItem('pdstudio:v1:index'); else localStorage.setItem('pdstudio:v1:index', idx);
  });
});

T.test('wp6 persist: a full store is reported as quota, and nothing throws', function (a) {
  return wp6Studio().then(function (S) {
    var proj = S.store.blankProject('Quota test'), set = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    try {
      var r = S.persist.saveProject(proj);
      a.equal(r.ok, false); a.equal(r.quota, true);
    } finally { Storage.prototype.setItem = set; }
    Storage.prototype.setItem = function () { throw new Error('some other failure'); };
    try { var r2 = S.persist.saveProject(proj); a.equal(r2.ok, false); a.equal(r2.quota, false, 'another failure is not a quota'); }
    finally { Storage.prototype.setItem = set; }
    a.equal(S.persist.isQuota({ name: 'QuotaExceededError' }), true); a.equal(S.persist.isQuota({ code: 22 }), true); a.equal(S.persist.isQuota(null), false);
  });
});

T.test('wp6 persist: IndexedDB keeps assets by hash and returns them in bulk', function (a) {
  return wp6Studio().then(function (S) {
    var A = S.persist.assets, h1 = 'wp6-test-hash-1', h2 = 'wp6-test-hash-2';
    return A.put({ hash: h1, type: 'image', name: 'a.png', mime: 'image/png', src: 'data:image/png;base64,AAAA', w: 2, h: 2, bytes: 3 }).then(function (ok) {
      a.equal(ok, true);
      return A.put({ hash: h2, type: 'font', name: 'f.ttf', mime: 'font/ttf', src: 'data:font/ttf;base64,AAAA', family: 'F', weight: '100 900', bytes: 3 });
    }).then(function () { return A.get(h1); }).then(function (r) {
      a.equal(r.name, 'a.png'); a.equal(r.w, 2);
      return A.getMany([h1, h2, h1, 'wp6-missing', '']);
    }).then(function (m) {
      a.deepEqual(Object.keys(m).sort(), [h1, h2]); a.equal(m[h2].family, 'F');
      return A.get('wp6-missing');
    }).then(function (r) { a.equal(r, null, 'a missing hash is null'); });
  });
});

T.test('wp6 persist: handles are stored per project', function (a) {
  return wp6Studio().then(function (S) {
    var H = S.persist.handles;
    return H.put('wp6-proj', { kind: 'file', name: 'x.html' }, 'x.html').then(function (ok) {
      // a plain object is cloneable; a real FileSystemFileHandle is too (Chrome)
      a.equal(ok, true); return H.get('wp6-proj');
    }).then(function (h) { a.equal(h.name, 'x.html'); return H.remove('wp6-proj'); }).then(function () { return H.get('wp6-proj'); }).then(function (h) { a.equal(h, null); });
  });
});

T.test('wp6 persist: the tab lock — the first tab holds, a second is told, take-over moves it', function (a) {
  return wp6Studio().then(function (S) {
    var id = 'wp6-lock-' + Math.floor(performance.now()), first, second, lost = 0;
    return S.persist.lock(id).then(function (l) {
      first = l; a.equal(l.held, true, 'the first tab holds the project');
      l.onLost(function () { lost++; });
      return S.persist.lock(id);
    }).then(function (l) {
      second = l; a.equal(l.held, false, 'the second tab does not');
      second.takeOver();
      return new Promise(function (r) { setTimeout(r, 120); });
    }).then(function () {
      a.equal(lost, 1, 'the first tab learns it lost the project');
      a.equal(first.held, false); a.equal(second.held, true);
      second.release(); first.release();
      return S.persist.lock(id);
    }).then(function (l) { a.equal(l.held, true, 'after both let go, the project is free again'); l.release(); });
  });
});

T.test('wp6 persist: with no file picker the target is a download, and writing a download needs no handle', function (a) {
  return wp6Studio().then(function (S) {
    var pick = window.showSaveFilePicker;
    window.showSaveFilePicker = undefined;
    try {
      return S.persist.target('wp6-x', 'deck.html').then(function (t) { a.deepEqual({ kind: t.kind, name: t.name }, { kind: 'download', name: 'deck.html' }); });
    } finally { window.showSaveFilePicker = pick; }
  });
});

T.test('wp6 persist: a picker the user cancels saves nothing; a picker that works writes the whole file and remembers its handle', function (a) {
  return wp6Studio().then(function (S) {
    var pick = window.showSaveFilePicker, written = [];
    var handle = { name: 'talk.html', createWritable: function () { return Promise.resolve({ write: function (t) { written.push(t); return Promise.resolve(); }, close: function () { return Promise.resolve(); } }); } };
    window.showSaveFilePicker = function () { var e = new Error('cancelled'); e.name = 'AbortError'; return Promise.reject(e); };
    return S.persist.target('wp6-pick', 'deck.html', { saveAs: true }).then(function (t) {
      a.equal(t.kind, 'cancelled');
      return S.persist.write(t, 'x');
    }).then(function (w) {
      a.equal(w.ok, false); a.equal(w.cancelled, true); a.equal(written.length, 0);
      window.showSaveFilePicker = function () { return Promise.resolve(handle); };
      return S.persist.target('wp6-pick', 'deck.html', { saveAs: true });
    }).then(function (t) {
      a.equal(t.kind, 'handle'); a.equal(t.name, 'talk.html');
      return S.persist.write(t, '<html>hello</html>');
    }).then(function (w) {
      a.deepEqual({ ok: w.ok, via: w.via, fileName: w.fileName }, { ok: true, via: 'file', fileName: 'talk.html' });
      a.deepEqual(written, ['<html>hello</html>']);
      window.showSaveFilePicker = function () { var e = new Error('blocked'); e.name = 'SecurityError'; return Promise.reject(e); };
      return S.persist.target('wp6-pick', 'deck.html', { saveAs: true });
    }).then(function (t) { a.equal(t.kind, 'download', 'a picker that refuses falls back to a download'); }).then(function () { return S.persist.handles.remove('wp6-pick'); })
      .then(function () { window.showSaveFilePicker = pick; }, function (e) { window.showSaveFilePicker = pick; throw e; });
  });
});
