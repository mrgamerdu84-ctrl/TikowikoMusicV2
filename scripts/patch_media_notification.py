from pathlib import Path

path = Path('app/src/main/java/com/tikowiko/musicv2/MusicService.java')
text = path.read_text(encoding='utf-8')

# Keep the real player source readable while applying the visual notification
# skin during CI. Android/OEM SystemUI still owns the final lock-screen layout,
# but large artwork + colorized MediaStyle gives it a much richer dark/gold look.
if 'import android.graphics.Bitmap;' not in text:
    text = text.replace(
        'import android.content.SharedPreferences;\n',
        'import android.content.SharedPreferences;\n'
        'import android.graphics.Bitmap;\n'
        'import android.graphics.BitmapFactory;\n'
        'import android.graphics.Color;\n'
    )

old = '''        Notification.Builder b = Build.VERSION.SDK_INT >= 26\n                ? new Notification.Builder(this, CHANNEL)\n                : new Notification.Builder(this);\n\n        Notification.MediaStyle style = new Notification.MediaStyle()\n                .setShowActionsInCompactView(0, 1, 2);\n'''
new = '''        Notification.Builder b = Build.VERSION.SDK_INT >= 26\n                ? new Notification.Builder(this, CHANNEL)\n                : new Notification.Builder(this);\n\n        // Signature visuelle TikowikoFamily : violet nuit + or. Le téléphone\n        // garde la main sur la forme exacte de la carte de verrouillage, mais\n        // il reçoit désormais une vraie illustration et une couleur de média.\n        Bitmap notificationArtwork = null;\n        try {\n            notificationArtwork = BitmapFactory.decodeResource(getResources(), R.drawable.icon);\n        } catch (Exception ignored) {}\n        if (notificationArtwork != null) b.setLargeIcon(notificationArtwork);\n        b.setColor(Color.rgb(31, 18, 67));\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setColorized(true);\n\n        Notification.MediaStyle style = new Notification.MediaStyle()\n                .setShowActionsInCompactView(0, 1, 2);\n'''

if old not in text and 'Signature visuelle TikowikoFamily' not in text:
    raise SystemExit('MusicService notification block not found; patch not applied')
if old in text:
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Tikowiko media notification skin applied')
