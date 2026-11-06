#!/usr/bin/env python3
"""Prepara la pagina "versioni" con tutte le versioni del gioco, una per ogni modifica (commit).

Uso (lo fa da solo GitHub Actions a ogni pubblicazione):
    python3 tools/build-versions.py site
Crea site/versioni/index.html (elenco con data e descrizione) e site/versioni/NN/ (il gioco com'era).
I commit che non cambiano il gioco (solo note) non diventano una versione.
Ogni versione ha i suoi salvataggi (non legge quelli delle altre) e una piccola etichetta in basso.
"""
import html, io, os, subprocess, sys, tarfile
from datetime import datetime, timezone, timedelta

GAME = ['index.html', 'style.css', 'js', 'assets']
out = sys.argv[1] if len(sys.argv) > 1 else 'site'
root = os.path.join(out, 'versioni')


def git(*a):
    return subprocess.run(['git', *a], capture_output=True, check=True).stdout


def rome(ts):
    t = datetime.fromtimestamp(int(ts), timezone.utc)
    # ora italiana (solare/legale, approssimata: legale da fine marzo a fine ottobre)
    legal = (t.month, t.day) >= (3, 25) and (t.month, t.day) < (10, 26)
    return t + timedelta(hours=2 if legal else 1)


commits = git('log', '--reverse', '--format=%H%x09%ct%x09%s').decode().strip().split('\n')
versions, prev = [], None
for line in commits:
    sha, ts, msg = line.split('\t', 2)
    tree = git('ls-tree', '--name-only', sha).decode().split()
    paths = [p for p in GAME if p in tree]
    if 'index.html' not in paths:
        continue
    if prev and not git('diff', '--name-only', prev, sha, '--', *paths).strip():
        continue   # solo note o strumenti: il gioco è uguale alla versione prima
    prev = sha
    versions.append((sha, rome(ts), msg, paths))

for n, (sha, when, msg, paths) in enumerate(versions, 1):
    d = os.path.join(root, '%02d' % n)
    os.makedirs(d, exist_ok=True)
    data = git('archive', '--format=tar', sha, *paths)
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        try:
            tf.extractall(d, filter='data')
        except TypeError:   # Python vecchio senza filter
            tf.extractall(d)
    p = os.path.join(d, 'index.html')
    page = open(p, encoding='utf-8').read()
    label = 'Versione %d &middot; %s' % (n, when.strftime('%d/%m/%Y %H:%M'))
    # salvataggi separati per versione + etichetta in basso a destra
    head = ('<script>(function(){var P="v%d:",S=Storage.prototype,g=S.getItem,s=S.setItem,r=S.removeItem;'
            'S.getItem=function(k){return g.call(this,P+k)};S.setItem=function(k,v){return s.call(this,P+k,v)};'
            'S.removeItem=function(k){return r.call(this,P+k)};})();</script>' % n)
    tag = ('<div style="position:fixed;right:8px;bottom:6px;z-index:99;font:11px monospace;color:#ffd966;'
           'background:rgba(0,0,0,.55);padding:3px 7px;border-radius:3px;pointer-events:none">%s</div>' % label)
    page = page.replace('<head>', '<head>\n' + head, 1) if '<head>' in page else head + page
    page = page.replace('</body>', tag + '\n</body>', 1) if '</body>' in page else page + tag
    open(p, 'w', encoding='utf-8').write(page)

rows = []
for n, (sha, when, msg, paths) in reversed(list(enumerate(versions, 1))):
    rows.append('<li><a class="play" href="%02d/">%d</a><div><b>%s</b><span>%s</span></div><a class="btn" href="%02d/">Gioca</a></li>'
                % (n, n, html.escape(msg), when.strftime('%d/%m/%Y alle %H:%M'), n))
index = '''<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Supplyville - tutte le versioni</title>
<style>
body { margin: 0; background: #1a1c2c; color: #f4f4f4; font-family: monospace; }
main { max-width: 860px; margin: 0 auto; padding: 24px 16px 40px; }
h1 { color: #ffd966; letter-spacing: 3px; text-shadow: 3px 3px 0 #0e0f1a; margin: 0 0 4px; }
p { color: #c9d2dc; line-height: 1.5; }
ul { list-style: none; padding: 0; margin: 18px 0 0; display: flex; flex-direction: column; gap: 8px; }
li { display: flex; align-items: center; gap: 12px; background: #262b44; border: 2px solid #44486b; border-radius: 5px; padding: 10px 12px; }
li:hover { border-color: #ffd966; }
li div { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
li b { font-weight: normal; line-height: 1.4; }
li span { color: #94b0c2; font-size: 12px; }
a.play { min-width: 34px; text-align: center; font-size: 18px; color: #ffd966; text-decoration: none; }
a.btn { color: #f4f4f4; text-decoration: none; background: #3f7a4a; border: 2px solid #5fa36a; border-radius: 3px; padding: 6px 12px; white-space: nowrap; }
a.btn:hover { background: #4a8f57; }
.now { display: inline-block; margin-top: 8px; color: #ffd966; }
</style></head><body><main>
<h1>SUPPLYVILLE</h1>
<p>Tutte le versioni del gioco, dalla prima all'ultima (%d versioni). Ogni versione si apre e si gioca com'era quel giorno:
in basso a destra c'è il numero della versione. Ogni versione ha i suoi salvataggi.</p>
<a class="now" href="../">&rarr; Gioca alla versione attuale</a>
<ul>
%s
</ul>
</main></body></html>
''' % (len(versions), '\n'.join(rows))
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(index)
print('versioni:', len(versions))
