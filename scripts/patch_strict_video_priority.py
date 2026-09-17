from pathlib import Path

path = Path('app/src/main/java/com/tikowiko/musicv2/MusicService.java')
text = path.read_text(encoding='utf-8')

old = '''    public boolean pauseForExternalMedia() {
        if ("keep".equals(focusMode)) return false;
        try {
'''
new = '''    public boolean pauseForExternalMedia() {
        // Une vraie vidéo ou un lecteur média externe reste toujours prioritaire.
        // Le mode "keep" ne doit protéger que les jeux, jamais Netflix/YouTube/etc.
        try {
'''

if old in text:
    text = text.replace(old, new, 1)
elif 'Le mode "keep" ne doit protéger que les jeux' not in text:
    raise SystemExit('pauseForExternalMedia block not found')

path.write_text(text, encoding='utf-8')
print('Strict external video priority applied')
