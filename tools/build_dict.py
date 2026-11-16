"""把 kaikki.org 提取的中文维基词典「朝鲜语」数据，整理成网页可直接加载的 dict/wiktionary-ko-zh.js。

数据来源：https://kaikki.org/zhwiktionary/朝鲜语/ （维基词典，CC BY-SA 4.0 与 GFDL）
用法：python3 tools/build_dict.py <kaikki 下载的 .jsonl 文件>

只保留有中文释义的韩文词条。「汉字或谚汉混合表记：…」这类只说明汉字写法、没有释义的条目会被丢掉。
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1])
HANGUL_WORD = re.compile(r'[가-힣]+( [가-힣]+)*')
NO_MEANING = re.compile(r'^(汉字或谚汉混合表记|漢字或諺漢混合表記)')
EXAMPLE = re.compile(r'^([^\u3000]*[가-힣][^\u3000]*?)[\u3000\s]{2,}(.+)$')  # 「韩文　　中文」

entries = {}
for line in SRC.open(encoding='utf-8'):
    e = json.loads(line)
    word = e['word']
    if not HANGUL_WORD.fullmatch(word):
        continue
    glosses, examples = [], []
    for s in e.get('senses', []):
        gl = [g.strip() for g in s.get('glosses', []) if g.strip() and not NO_MEANING.match(g)]
        if not gl:
            continue
        glosses.extend(gl)
        for x in s.get('examples', []):
            m = EXAMPLE.match(x.get('text', '').strip())
            if m and '：' not in m.group(1):
                examples.append([m.group(1).strip(), m.group(2).strip()])
    if not glosses:
        continue
    hanja = next((f['form'] for f in e.get('forms', []) if 'hanja' in f.get('tags', [])), '')
    cur = entries.setdefault(word, {'g': [], 'x': [], 'h': hanja})
    cur['g'] += [g for g in glosses if g not in cur['g']]
    cur['x'] += examples
    cur['h'] = cur['h'] or hanja

rows = [[w, v['g'][:6], v['x'][:3], v['h']] for w, v in sorted(entries.items())]
out = ROOT / 'dict' / 'wiktionary-ko-zh.js'
out.parent.mkdir(exist_ok=True)
out.write_text(
    '// 中文维基词典「朝鲜语」词条，经 kaikki.org（wiktextract）提取后整理；许可 CC BY-SA 4.0，见同目录 来源与许可.txt\n'
    '// 格式：[韩文, [中文释义…], [[韩文例句, 中文译文]…], 汉字写法]。由 tools/build_dict.py 生成，勿手工编辑\n'
    f'window.WIKI_DICT = {json.dumps(rows, ensure_ascii=False, separators=(",", ":"))};\n', encoding='utf-8')
print(len(rows), 'entries,', sum(len(r[2]) for r in rows), 'examples,', out.stat().st_size // 1024, 'KB')
