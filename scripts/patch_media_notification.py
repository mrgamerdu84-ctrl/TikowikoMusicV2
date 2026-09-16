from pathlib import Path

path = Path('app/src/main/java/com/tikowiko/musicv2/MusicService.java')
text = path.read_text(encoding='utf-8')

# Android/OEM SystemUI garde la main sur la forme exacte de la carte de
# verrouillage. On lui fournit cependant tout ce qu'il faut pour un rendu
# proche du lecteur Tikowiko demandé : violet nuit profond + or chaud,
# vraie pochette du morceau, métadonnées complètes et progression MediaSession.
imports = [
    'import android.graphics.Bitmap;\n',
    'import android.graphics.BitmapFactory;\n',
    'import android.graphics.Canvas;\n',
    'import android.graphics.Color;\n',
    'import android.graphics.Paint;\n',
    'import android.graphics.Rect;\n',
    'import android.graphics.RectF;\n',
    'import android.media.MediaMetadataRetriever;\n',
]
anchor = 'import android.content.SharedPreferences;\n'
for imp in imports:
    if imp not in text:
        text = text.replace(anchor, anchor + imp, 1)

# Construit une pochette carrée qui reprend les mêmes couleurs que le lecteur :
# fond #1C142B et liseré or #D5A75D. La vraie pochette reste au centre.
if 'private Bitmap makeTikowikoArtwork(Bitmap source)' not in text:
    helper_theme = r'''
    private Bitmap makeTikowikoArtwork(Bitmap source) {
        if (source == null) return null;
        final int size = 640;
        final int pad = 24;
        final int radius = 42;
        final int bg = Color.rgb(28, 20, 43);      // #1C142B
        final int gold = Color.rgb(213, 167, 93);  // #D5A75D

        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        canvas.drawColor(bg);

        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(12f);
        border.setColor(gold);
        RectF frame = new RectF(10f, 10f, size - 10f, size - 10f);
        canvas.drawRoundRect(frame, radius, radius, border);

        int w = Math.max(1, source.getWidth());
        int h = Math.max(1, source.getHeight());
        float scale = Math.max((size - pad * 2f) / w, (size - pad * 2f) / h);
        int sw = Math.max(1, Math.round((size - pad * 2f) / scale));
        int sh = Math.max(1, Math.round((size - pad * 2f) / scale));
        int sx = Math.max(0, (w - sw) / 2);
        int sy = Math.max(0, (h - sh) / 2);

        Rect src = new Rect(sx, sy, Math.min(w, sx + sw), Math.min(h, sy + sh));
        RectF dst = new RectF(pad, pad, size - pad, size - pad);
        Paint imagePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        canvas.drawBitmap(source, src, dst, imagePaint);

        // Deuxième liseré fin pour que l'or reste visible après extraction de
        // palette par Android/HyperOS.
        Paint inner = new Paint(Paint.ANTI_ALIAS_FLAG);
        inner.setStyle(Paint.Style.STROKE);
        inner.setStrokeWidth(7f);
        inner.setColor(gold);
        RectF innerFrame = new RectF(pad - 3f, pad - 3f, size - pad + 3f, size - pad + 3f);
        canvas.drawRoundRect(innerFrame, 30f, 30f, inner);
        return out;
    }

'''
    marker = '    private Bitmap loadCurrentArtwork() {'
    if marker not in text:
        raise SystemExit('loadCurrentArtwork marker not found')
    text = text.replace(marker, helper_theme + marker, 1)

# Charge la vraie pochette locale puis applique la signature violet/or.
old_return = '''        return artwork;\n    }\n\n    private Notification buildNotification(boolean playing) {'''
new_return = '''        return makeTikowikoArtwork(artwork);\n    }\n\n    private Notification buildNotification(boolean playing) {'''
if old_return in text:
    text = text.replace(old_return, new_return, 1)
elif 'return makeTikowikoArtwork(artwork);' not in text:
    raise SystemExit('Artwork return block not found')

# Enrichit les métadonnées MediaSession avec la pochette thémée.
old_meta = '''            MediaMetadata metadata = new MediaMetadata.Builder()\n                    .putString(MediaMetadata.METADATA_KEY_TITLE, t.title)\n                    .putString(MediaMetadata.METADATA_KEY_ARTIST, t.artist)\n                    .putString(MediaMetadata.METADATA_KEY_ALBUM, t.folder)\n                    .putLong(MediaMetadata.METADATA_KEY_DURATION, duration)\n                    .build();\n            mediaSession.setMetadata(metadata);'''
new_meta = '''            MediaMetadata.Builder metadataBuilder = new MediaMetadata.Builder()\n                    .putString(MediaMetadata.METADATA_KEY_TITLE, t.title)\n                    .putString(MediaMetadata.METADATA_KEY_ARTIST, t.artist)\n                    .putString(MediaMetadata.METADATA_KEY_ALBUM, t.folder)\n                    .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);\n            Bitmap artwork = loadCurrentArtwork();\n            if (artwork != null) {\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, artwork);\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, artwork);\n            }\n            mediaSession.setMetadata(metadataBuilder.build());'''
if old_meta in text:
    text = text.replace(old_meta, new_meta, 1)
elif 'metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART' not in text:
    raise SystemExit('MediaSession metadata block not found')

old_notification = '''        Notification.Builder b = Build.VERSION.SDK_INT >= 26\n                ? new Notification.Builder(this, CHANNEL)\n                : new Notification.Builder(this);\n\n        Notification.MediaStyle style = new Notification.MediaStyle()\n                .setShowActionsInCompactView(0, 1, 2);'''
new_notification = '''        Notification.Builder b = Build.VERSION.SDK_INT >= 26\n                ? new Notification.Builder(this, CHANNEL)\n                : new Notification.Builder(this);\n\n        // Même palette que le lecteur montré : violet nuit #1C142B + or #D5A75D.\n        Bitmap notificationArtwork = loadCurrentArtwork();\n        if (notificationArtwork != null) b.setLargeIcon(notificationArtwork);\n        b.setColor(Color.rgb(28, 20, 43));\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setColorized(true);\n\n        Notification.MediaStyle style = new Notification.MediaStyle()\n                .setShowActionsInCompactView(0, 1, 2);'''
if old_notification in text:
    text = text.replace(old_notification, new_notification, 1)
elif 'Même palette que le lecteur montré' not in text and 'Style demandé : carte sombre, violette et dorée' in text:
    text = text.replace('''        // Style demandé : carte sombre, violette et dorée, avec vraie pochette.\n        Bitmap notificationArtwork = loadCurrentArtwork();\n        if (notificationArtwork != null) b.setLargeIcon(notificationArtwork);\n        b.setColor(Color.rgb(39, 22, 79));\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setColorized(true);''', '''        // Même palette que le lecteur montré : violet nuit #1C142B + or #D5A75D.\n        Bitmap notificationArtwork = loadCurrentArtwork();\n        if (notificationArtwork != null) b.setLargeIcon(notificationArtwork);\n        b.setColor(Color.rgb(28, 20, 43));\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setColorized(true);''', 1)
elif 'Même palette que le lecteur montré' not in text:
    raise SystemExit('Notification builder block not found')

# Ajoute une signature d'application courte sans remplacer le vrai titre/artiste.
old_subtext = '.setSubText(current == null ? null : current.folder)'
new_subtext = '.setSubText(current == null ? "TikowikoMusic" : "TikowikoMusic · " + current.folder)'
if old_subtext in text:
    text = text.replace(old_subtext, new_subtext, 1)

path.write_text(text, encoding='utf-8')
print('Tikowiko violet-gold media notification skin applied')
