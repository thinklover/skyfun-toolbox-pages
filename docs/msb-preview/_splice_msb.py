# -*- coding: utf-8 -*-
from pathlib import Path

root = Path(__file__).resolve().parents[2]
index = root / 'index.html'
shell = Path(__file__).with_name('page-shell.html')
text = index.read_text(encoding='utf-8')
start = text.index('        <div id="page-meeting-scoreboard"')
end = text.index('        <!-- 專區頁面：業務主管 -->')
new = shell.read_text(encoding='utf-8')
if not new.endswith('\n'):
    new += '\n'
out = text[:start] + new + text[end:]
# cache bump
out = out.replace(
    'href="./css/meeting-scoreboard.css?v=20261110-msb9"',
    'href="./css/meeting-scoreboard.css?v=20261111-msb-v2"',
)
out = out.replace(
    'src="./js/meeting-scoreboard.js?v=20261111-msb-dense"',
    'src="./js/meeting-scoreboard.js?v=20261111-msb-v2"',
)
index.write_text(out, encoding='utf-8')
print('spliced', end - start, '->', len(new))
