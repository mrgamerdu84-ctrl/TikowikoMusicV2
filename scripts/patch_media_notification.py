from pathlib import Path

path = Path('app/src/main/java/com/tikowiko/musicv2/MusicService.java')
text = path.read_text(encoding='utf-8')

# Android/OEM SystemUI garde la main sur la forme exacte de la carte de
# verrouillage. On lui fournit cependant tout ce qu'il faut pour un rendu
# beaucoup plus riche : vraie pochette du morceau, palette violet/or,
# métadonnées complètes et progression MediaSession.
imports = [
    'import android.graphics.Bitmap;\n',
    'import android.graphics.BitmapFactory;\n',
    'import android.graphics.Color;\n',
    'import android.media.MediaMetadataRetriever;\n',
]
anchor = 'import android.content.SharedPreferences;\n'
for imp in imports:
    if imp not in text:
        text = text.replace(anchor, anchor + imp, 1)

# Ajoute un chargeur de pochette locale : image embarquée dans MP3/FLAC/M4A,
# puis icône Tikowiko en secours. On limite la taille pour éviter les grosses
# transactions Binder dans la notification/MediaSession.
if 'private Bitmap loadCurrentArtwork()' not in text:
    helper = r'''
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

        if (artwork != null) {
            int w = artwork.getWidth();
            int h = artwork.getHeight();
            int max = Math.max(w, h);
            if (max > 768) {
                float ratio = 768f / max;
                int nw = Math.max(1, Math.round(w * ratio));
                int nh = Math.max(1, Math.round(h * ratio));
                try { artwork = Bitmap.createScaledBitmap(artwork, nw, nh, true); }
                catch (Exception ignored) {}
            }
        }
        return artwork;
    }

'''
    marker = '    private Notification buildNotification(boolean playing) {'
    if marker not in text:
        raise SystemExit('buildNotification marker not found')
    text = text.replace(marker, helper + marker, 1)

# Enrichit les métadonnées MediaSession avec la pochette. Sur Android/HyperOS,
# c'est cette image que le système peut utiliser dans la carte média.
old_meta = '''            MediaMetadata metadata = new MediaMetadata.Builder()\n                    .putString(MediaMetadata.METADATA_KEY_TITLE, t.title)\n                    .putString(MediaMetadata.METADATA_KEY_ARTIST, t.artist)\n                    .putString(MediaMetadata.METADATA_KEY_ALBUM, t.folder)\n                    .putLong(MediaMetadata.METADATA_KEY_DURATION, duration)\n                    .build();\n            mediaSession.setMetadata(metadata);'''
new_meta = '''            MediaMetadata.Builder metadataBuilder = new MediaMetadata.Builder()\n                    .putString(MediaMetadata.METADATA_KEY_TITLE, t.title)\n                    .putString(MediaMetadata.METADATA_KEY_ARTIST, t.artist)\n                    .putString(MediaMetadata.METADATA_KEY_ALBUM, t.folder)\n                    .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);\n            Bitmap artwork = loadCurrentArtwork();\n            if (artwork != null) {\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, artwork);\n                metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, artwork);\n            }\n            mediaSession.setMetadata(metadataBuilder.build());'''
if old_meta in text:
    text = text.replace(old_meta, new_meta, 1)
elif 'metadataBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART' not in text:
    raise SystemExit('MediaSession metadata block not found')

old_notification = '''        Notification.Builder b = Build.VERSION.SDK_INT >= 26\n                ? new Notification.Builder(this, CHANNEL)\n                : new Notification.Builder(this);\n\n        Notification.MediaStyle style = new Notification.MediaStyle()\n                .setShowActionsInCompactView(0, 1, 2);'''
new_notification = '''        Notification.Builder b = Build.VERSION.SDK_INT >= 26\n                ? new Notification.Builder(this, CHANNEL)\n                : new Notification.Builder(this);\n\n        // Style demandé : carte sombre, violette et dorée, avec vraie pochette.\n        Bitmap notificationArtwork = loadCurrentArtwork();\n        if (notificationArtwork != null) b.setLargeIcon(notificationArtwork);\n        b.setColor(Color.rgb(39, 22, 79));\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setColorized(true);\n\n        Notification.MediaStyle style = new Notification.MediaStyle()\n                .setShowActionsInCompactView(0, 1, 2);'''
if old_notification in text:
    text = text.replace(old_notification, new_notification, 1)
elif 'Style demandé : carte sombre, violette et dorée' not in text:
    raise SystemExit('Notification builder block not found')

# Ajoute une signature d'application courte sans remplacer le vrai titre/artiste.
old_subtext = '.setSubText(current == null ? null : current.folder)'
new_subtext = '.setSubText(current == null ? "TikowikoMusic" : "TikowikoMusic · " + current.folder)'
if old_subtext in text:
    text = text.replace(old_subtext, new_subtext, 1)

path.write_text(text, encoding='utf-8')
print('Tikowiko premium media notification skin applied')
