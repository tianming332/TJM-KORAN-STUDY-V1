"""从 handbook.html 生成 knowledge.js：知识点章节（文字基础、收音与音变、语法、对话、练习）与资料核对。
词汇章节不在这里：它们已合并进 data-handbook.js 的单词表。

用法：python3 tools/build_knowledge.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / 'handbook.html').read_text(encoding='utf-8')

CHAPTERS = ['writing', 'batchim', 'grammar', 'dialogues', 'practice']
REFERENCE = ['sources', 'audit']
TITLE_RE = re.compile(r'^\s*<div class="section-title"><div>(.*?)</div></div>', re.S)
strip = lambda s: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s)).strip()

def section(sid):
    m = re.search(r'<section[^>]*id="%s"[^>]*>(.*?)</section>' % sid, html, re.S)
    if not m: raise SystemExit(f'handbook.html 缺少章节 {sid}')
    body = m.group(1)
    t = TITLE_RE.match(body)
    head = t.group(1) if t else ''
    title = strip(re.search(r'<h2>(.*?)</h2>', head, re.S).group(1)) if '<h2>' in head else sid
    desc = re.search(r'<p>(.*?)</p>', head, re.S)
    return {
        'id': sid,
        'title': re.sub(r'^\d+｜', '', title),
        'desc': strip(desc.group(1)) if desc else '',
        'html': body[t.end():].strip() if t else body.strip(),
    }

out = {'chapters': [section(s) for s in CHAPTERS], 'reference': [section(s) for s in REFERENCE]}
js = ('// 由 tools/build_knowledge.py 从 handbook.html 生成，改内容请改 handbook.html 后重新运行\n'
      f'const KB_CHAPTERS = {json.dumps(out["chapters"], ensure_ascii=False)};\n'
      f'const KB_REFERENCE = {json.dumps(out["reference"], ensure_ascii=False)};\n')
(ROOT / 'knowledge.js').write_text(js, encoding='utf-8')
for c in out['chapters'] + out['reference']:
    print(c['id'], c['title'], '|', c['desc'][:30], '|', len(c['html']))
