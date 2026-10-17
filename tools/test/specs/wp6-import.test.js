/* tools/test/specs/wp6-import.test.js — the intake pipeline: classify, pictures, SVG, fonts, saved presentations (spec §7.5, §3.6, WP6). */

function wp6File(name, type, text) { return new File([text], name, { type: type }); }
function wp6Dims(src) {
  return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res({ w: i.naturalWidth, h: i.naturalHeight }); }; i.onerror = rej; i.src = src; });
}

T.test('wp6 import: classify sorts files and words the refusals', function (a) {
  return wp6Studio().then(function (S) {
    var c = function (n, t) { return S.files.classify(wp6File(n, t || '', 'x')); };
    ['a.png', 'A.JPG', 'a.jpeg', 'a.webp', 'logo.svg'].forEach(function (n) { a.equal(c(n).kind, 'image', n); });
    ['a.woff2', 'a.woff', 'a.ttf', 'a.otf', 'A.OTF'].forEach(function (n) { a.equal(c(n).kind, 'font', n); });
    ['deck.html', 'deck.htm'].forEach(function (n) { a.equal(c(n).kind, 'html', n); });
    var heic = c('IMG_1.HEIC', 'image/heic');
    a.equal(heic.kind, 'unsupported'); a.equal(heic.message, "Can't use .heic yet. Export it as PNG or JPEG.");
    a.equal(c('x.heif').message, "Can't use .heif yet. Export it as PNG or JPEG.");
    a.equal(c('slides.pdf', 'application/pdf').message, "Can't use .pdf yet. Export it as PNG or JPEG.");
    a.equal(c('clip.mp4', 'video/mp4').kind, 'unsupported');
    a.equal(c('clip.mov', 'video/quicktime').message, "Can't use .mov yet. Export it as PNG or JPEG.");
    a.equal(c('notes.docx').message, "Can't use this file type.");
    a.equal(c('noext').message, "Can't use this file type.");
  });
});

T.test('wp6 import: asset ids are the slug of the file name, unique within the deck', function (a) {
  return wp6Studio().then(function (S) {
    var f = S.files, taken = {};
    a.equal(f.assetId('Team Photo.JPG', taken), 'team-photo');
    taken['team-photo'] = 1;
    a.equal(f.assetId('Team Photo.jpg', taken), 'team-photo-2');
    taken['team-photo-2'] = 1;
    a.equal(f.assetId('team photo.png', taken), 'team-photo-3');
    a.equal(f.assetId('###.png', {}), 'asset', 'nothing to slug');
    a.equal(f.assetId('The Very Long File Name That Goes On And On And On Forever And Ever.png', {}).length <= 40, true);
  });
});

T.test('wp6 import: a big opaque picture is shrunk to 2400 px and becomes a JPEG', function (a) {
  return wp6Studio().then(function (S) {
    return wp6Canvas(5000, 3000, 'big.png', 'image/png').then(function (file) { return S.files.processImage(file); }).then(function (r) {
      a.equal(r.type, 'image'); a.equal(r.w, 2400); a.equal(r.h, 1440, 'aspect kept'); a.equal(r.mime, 'image/jpeg');
      a.equal(r.alpha, false); a.equal(r.name, 'big.png');
      a.ok(/^data:image\/jpeg;base64,/.test(r.src)); a.equal(r.bytes, S.files.bytesOf(r.src));
      return wp6Dims(r.src);
    }).then(function (d) { a.deepEqual(d, { w: 2400, h: 1440 }, 'the data really is that size'); });
  });
});

T.test('wp6 import: a small picture is not enlarged, and one with transparency stays a PNG', function (a) {
  return wp6Studio().then(function (S) {
    return wp6Canvas(600, 200, 'logo.png', 'image/png', function (g, w, h) { g.fillStyle = '#e0402a'; g.beginPath(); g.arc(100, 100, 80, 0, 7); g.fill(); })
      .then(function (file) { return S.files.processImage(file); }).then(function (r) {
        a.equal(r.w, 600); a.equal(r.h, 200); a.equal(r.mime, 'image/png'); a.equal(r.alpha, true);
        a.ok(/^data:image\/png;base64,/.test(r.src));
      });
  });
});

T.test('wp6 import: a single transparent pixel is enough to keep alpha', function (a) {
  return wp6Studio().then(function (S) {
    return wp6Canvas(300, 300, 'dot.png', 'image/png', function (g, w, h) { g.fillStyle = '#123456'; g.fillRect(0, 0, w, h); g.clearRect(299, 299, 1, 1); })
      .then(function (file) { return S.files.processImage(file); }).then(function (r) { a.equal(r.alpha, true); a.equal(r.mime, 'image/png'); });
  });
});

T.test('wp6 import: an SVG with only a viewBox is rasterized 2400 px wide, at the viewBox aspect', function (a) {
  return wp6Studio().then(function (S) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><circle cx="20" cy="20" r="15" fill="#2a6fe0"/></svg>';
    return S.files.processImage(wp6File('only-viewbox.svg', 'image/svg+xml', svg)).then(function (r) {
      a.equal(r.w, 2400, 'not the 300 px natural size'); a.equal(r.h, 960);
      a.equal(r.mime, 'image/png'); a.equal(r.alpha, true);
      return wp6Dims(r.src);
    }).then(function (d) {
      a.deepEqual(d, { w: 2400, h: 960 });
      var tall = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 100"><rect width="50" height="100" fill="#000"/></svg>';
      return S.files.processImage(wp6File('tall.svg', 'image/svg+xml', tall));
    }).then(function (r) {
      a.equal(r.h, 2400, 'a tall SVG keeps its long edge at 2400'); a.equal(r.w, 1200);
      var sized = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><rect width="200" height="50" fill="#000"/></svg>';
      return S.files.processImage(wp6File('sized.svg', 'image/svg+xml', sized));
    }).then(function (r) { a.equal(r.w, 2400); a.equal(r.h, 600, 'with width and height and no viewBox the aspect comes from them'); });
  });
});

T.test('wp6 import: files that cannot be read are refused in plain words', function (a) {
  return wp6Studio().then(function (S) {
    return S.files.process(wp6File('broken.svg', 'image/svg+xml', 'this is not xml <<<')).then(function (r) {
      a.equal(r.ok, false); a.equal(r.message, "Couldn't read this SVG.");
      return S.files.process(wp6File('broken.png', 'image/png', 'not a png'));
    }).then(function (r) {
      a.equal(r.ok, false); a.equal(r.message, "Couldn't read this picture. Try PNG or JPEG.");
      return S.files.process(wp6File('broken.woff2', 'font/woff2', 'definitely not a font'));
    }).then(function (r) {
      a.equal(r.ok, false); a.equal(r.message, "Couldn't read this font; using the theme font.");
      return S.files.process(wp6File('x.heic', 'image/heic', 'x'));
    }).then(function (r) {
      a.deepEqual({ ok: r.ok, message: r.message }, { ok: false, message: "Can't use .heic yet. Export it as PNG or JPEG." });
      return S.files.process(wp6File('page.html', 'text/html', '<html></html>'));
    }).then(function (r) { a.equal(r.ok, false); a.equal(r.kind, 'html'); });
  });
});

T.test('wp6 import: addFiles registers assets and answers in the shape the assets panel expects', function (a) {
  return wp6Studio().then(function (S) {
    var proj = wp6Project(), id = proj.deck.id;
    S.store.open(proj);
    return Promise.all([wp6Canvas(400, 300, 'Hero Shot.jpg', 'image/jpeg'), wp6Canvas(80, 40, 'Hero Shot.png', 'image/png')]).then(function (fs) {
      return S.files.addFiles(fs.concat([wp6File('bad.heic', 'image/heic', 'x')]), { deckId: id });
    }).then(function (r) {
      a.deepEqual(r.added.map(function (x) { return x.id; }), ['hero-shot', 'hero-shot-2'], 'ids are unique within the batch');
      a.ok(r.added.every(function (x) { return /^[0-9a-f]{64}$/.test(x.hash) && x.kind === 'image'; }), 'with SHA-256 hashes');
      a.deepEqual(r.rejected.map(function (x) { return x.name + '|' + x.msg; }), ["bad.heic|Can't use .heic yet. Export it as PNG or JPEG."], 'refusals use { name, msg }');
      a.equal(r.rejected[0].message, r.rejected[0].msg);
      var reg = PD.assets.get(id);
      a.deepEqual(Object.keys(reg).sort(), ['hero-shot', 'hero-shot-2'], 'registered with PD.assets.put');
      a.equal(reg['hero-shot'].type, 'image'); a.equal(reg['hero-shot'].w, 400); a.ok(/^data:image\/jpeg/.test(reg['hero-shot'].src));
      a.equal(S.store.get().assets['hero-shot'], undefined, 'the intake does not touch the project: the caller commits project.assets[id] = hash');
      return S.persist.assets.get(r.added[0].hash).then(function (rec) { a.equal(rec.name, 'Hero Shot.jpg'); a.equal(rec.mime, 'image/jpeg'); });
    }).then(function () { S.store.close(); PD.assets.remove(id, 'hero-shot'); PD.assets.remove(id, 'hero-shot-2'); },
      function (e) { S.store.close(); throw e; });
  });
});

T.test('wp6 import: records and sources convert both ways without losing fields', function (a) {
  return wp6Studio().then(function (S) {
    var img = { type: 'image', src: 'data:image/png;base64,AAAA', w: 4, h: 3, name: 'p.png', bytes: 3, alpha: true, mime: 'image/png' };
    var rec = S.files.recordOf(img, 'h1');
    a.deepEqual(rec, { hash: 'h1', type: 'image', name: 'p.png', mime: 'image/png', src: img.src, w: 4, h: 3, bytes: 3, alpha: true });
    a.deepEqual(S.files.sourceOf(rec), { type: 'image', src: img.src, w: 4, h: 3, name: 'p.png', bytes: 3, alpha: true });
    var font = { type: 'font', src: 'data:font/ttf;base64,AAAA', family: 'Brand', weight: '100 900', style: 'normal', name: 'b.ttf', bytes: 3, mime: 'font/ttf' };
    var fr = S.files.recordOf(font, 'h2');
    a.deepEqual(S.files.sourceOf(fr), { type: 'font', src: font.src, family: 'Brand', name: 'b.ttf', bytes: 3, weight: '100 900', style: 'normal' }, 'a font source has no w and h');
    a.equal(S.files.familyFrom('Inter-Regular_Italic.woff2'), 'Inter Regular Italic');
    a.equal(S.files.familyFrom('.ttf'), 'Brand font');
  });
});

T.test('wp6 import: readPresentation opens a saved deck, refuses a hand-written one and a stranger', function (a) {
  return wp6Studio().then(function (S) {
    var deck = { format: 2, id: 'wp6-open', meta: { title: 'Open </script><!-- */ & test', theme: 'cosmos', generator: 'studio@2.0.0', story: PD.story.interview.blank() },
      scenes: [{ id: 'a', template: 'statement', props: { line: 'Hello \u{1F680} </script>' }, notes: 'x */ y' }] };
    var html = PD.exportHTML('wp6-open', { deck: deck, assets: {} });
    return S.files.readPresentation(wp6File('talk.html', 'text/html', html)).then(function (r) {
      a.equal(r.id, 'wp6-open'); a.deepEqual(r.deck, deck, 'the deck comes back deepEqual'); a.deepEqual(r.assets, {});
      a.equal(r.title, 'Open </script><!-- */ & test');
      var hand = PD.exportHTML('one-giant-leap');
      return S.files.readPresentation(wp6File('ogl.html', 'text/html', hand)).then(function () { a.fail('a hand-written deck must not open'); }, function (e) {
        a.equal(e.message, 'This deck was written by hand. Open it in a code editor.');
      });
    }).then(function () {
      return S.files.readPresentation(wp6File('x.html', 'text/html', '<html><body>hello</body></html>')).then(function () { a.fail('a stranger must not open'); }, function (e) {
        a.equal(e.message, "That file isn't a pixeldeck presentation. Open a deck you saved from the Studio.");
      });
    });
  });
});
