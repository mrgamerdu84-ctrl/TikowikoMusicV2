from pathlib import Path

path = Path('app/src/main/java/com/tikowiko/musicv2/MusicService.java')
text = path.read_text(encoding='utf-8')

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

helpers = r'''
    private Bitmap makeTikowikoArtwork(Bitmap source) {
        if (source == null) return null;
        final int size = 640;
        final int pad = 24;
        final int bg = Color.rgb(28, 20, 43);      // #1C142B
        final int gold = Color.rgb(213, 167, 93);  // #D5A75D
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        canvas.drawColor(bg);

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

        Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
        border.setStyle(Paint.Style.STROKE);
        border.setStrokeWidth(10f);
        border.setColor(gold);
        canvas.drawRoundRect(new RectF(9f, 9f, size - 9f, size - 9f), 42f, 42f, border);
        return out;
    }

    private Bitmap loadCurrentArtwork() {
        Bitmap artwork = null;
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            Track t = currentTrack();
            if (t != null && t.uri != null && !t.uri.isEmpty()) {
                retriever.setDataSource(this, Uri.parse(t.uri));
                byte[] data = retriever.getEmbeddedPicture();
                if (data != null && data.length > 0) {
                    artwork = BitmapFactory.decodeByteArray(data, 0, data.length);
                }
            }
        } catch (Exception ignored) {
        } finally {
            try { retriever.release(); } catch (Exception ignored) {}
        }
        if (artwork == null) {
            try { artwork = BitmapFactory.decodeResource(getResources(), R.drawable.icon); }
            catch (Exception ignored) {}
        }
        return makeTikowikoArtwork(artwork);
    }

'''
if 'private Bitmap loadCurrentArtwork()' not in text:
    marker = '    private Notification buildNotification(boolean playing) {'
    if marker not in text:
        raise SystemExit('buildNotification marker not found')
    text = text.replace(marker, helpers + marker, 1)

old_meta = '''            MediaMetadata metadata = new MediaMetadata.Builder()\n                    .putString(MediaMetadata.METADATA_KEY_TITLE, t.title)\n                    .putString(MediaMetadata.METADATA_KEY_ARTIST, t.artist)\n                    .putString(MediaMetadata.METADATA_KEY_ALBUM, t.folder)\n                    .putLong(MediaMetadata.METADATA_KEY_DURATION, duration)\n                    .build();\n            mediaSession.setMetadata(metadata);'''
new_meta = '''            MediaMetadata.Builder metadataBuilder = new MediaMetadata.Builder()\n                    .putString(MediaMetadata.METADATA_KEY_TITLE, t.title)\n                    .putString(MediaMetadata.METADATA_KEY_ARTIST, t.artist)\n                    .putString(MediaMetadata.METADATA_KEY_ALBUM, t.folder)\n                    .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);\n            Bitmap artwork = loadCurrentArtwork();\n            if (artwork != null) {\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, artwork);\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, artwork);\n            }\n            mediaSession.setMetadata(metadataBuilder.build());'''
if old_meta in text:
    text = text.replace(old_meta, new_meta, 1)

builder = '''        Notification.Builder b = Build.VERSION.SDK_INT >= 26\n                ? new Notification.Builder(this, CHANNEL)\n                : new Notification.Builder(this);\n'''
theme = '''        Notification.Builder b = Build.VERSION.SDK_INT >= 26\n                ? new Notification.Builder(this, CHANNEL)\n                : new Notification.Builder(this);\n\n        Bitmap notificationArtwork = loadCurrentArtwork();\n        if (notificationArtwork != null) b.setLargeIcon(notificationArtwork);\n        b.setColor(Color.rgb(28, 20, 43));\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setColorized(true);\n'''
if 'Bitmap notificationArtwork = loadCurrentArtwork();' not in text:
    if builder not in text:
        raise SystemExit('notification builder marker not found')
    text = text.replace(builder, theme, 1)

old_subtext = '.setSubText(current == null ? null : current.folder)'
if old_subtext in text:
    text = text.replace(old_subtext, '.setSubText(current == null ? "TikowikoMusic" : "TikowikoMusic · " + current.folder)', 1)

path.write_text(text, encoding='utf-8')
print('Tikowiko violet-gold media notification skin applied')
