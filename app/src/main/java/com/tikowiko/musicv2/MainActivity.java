package com.tikowiko.musicv2;

import android.Manifest;
import android.app.Activity;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int REQ_AUDIO = 501;
    private static final int REQ_VOICE = 502;
    private static final int REQ_NOTIFICATIONS = 503;
    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    private WebView webView;
    private boolean pendingOpenLibrary = false;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);
        pendingOpenLibrary = getIntent() != null && getIntent().getBooleanExtra("openLibrary", false);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadsImagesAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                openLibraryIfRequested();
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.loadUrl("file:///android_asset/www/index.html");

        requestNotificationPermissionIfNeeded();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("openLibrary", false)) {
            pendingOpenLibrary = true;
            openLibraryIfRequested();
        }
    }

    private void openLibraryIfRequested() {
        if (!pendingOpenLibrary || webView == null) return;
        pendingOpenLibrary = false;
        webView.postDelayed(() -> webView.evaluateJavascript(
                "(function(){var b=document.querySelector('[data-go=\"library\"]');if(b)b.click();})();",
                null
        ), 180L);
    }

    public static void dispatchToWeb(final String javascript) {
        MainActivity a = current.get();
        if (a == null || a.webView == null) return;
        a.runOnUiThread(() -> a.webView.evaluateJavascript(javascript, null));
    }

    private boolean hasAudioPermissionInternal() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }
        return checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestAudioPermissionInternal() {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{Manifest.permission.READ_MEDIA_AUDIO}, REQ_AUDIO);
        } else {
            requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, REQ_AUDIO);
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    private void startVoiceSearchInternal() {
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag());
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Que veux-tu écouter ?");
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            startActivityForResult(intent, REQ_VOICE);
        } catch (Exception e) {
            dispatchToWeb("window.onTikoBotVoiceError && window.onTikoBotVoiceError();");
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_AUDIO) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            dispatchToWeb("window.onAudioPermissionResult && window.onAudioPermissionResult(" + ok + ");");
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VOICE) return;
        if (resultCode == RESULT_OK && data != null) {
            ArrayList<String> values = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (values != null && !values.isEmpty()) {
                dispatchToWeb("window.onTikoBotVoiceResult && window.onTikoBotVoiceResult(" + JSONObject.quote(values.get(0)) + ");");
                return;
            }
        }
        dispatchToWeb("window.onTikoBotVoiceError && window.onTikoBotVoiceError();");
    }

    private String normalizeFolder(String rawPath) {
        final String fallback = "Musique";
        if (rawPath == null || rawPath.trim().isEmpty()) return fallback;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            String value = rawPath.replace('\\', '/').trim();
            while (value.startsWith("/")) value = value.substring(1);
            while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
            return value.isEmpty() ? fallback : value;
        }
        File parent = new File(rawPath).getParentFile();
        if (parent == null) return fallback;
        String absolute = parent.getAbsolutePath().replace('\\', '/');
        String storage = "/storage/emulated/0/";
        if (absolute.startsWith(storage)) absolute = absolute.substring(storage.length());
        while (absolute.startsWith("/")) absolute = absolute.substring(1);
        return absolute.trim().isEmpty() ? fallback : absolute;
    }

    /**
     * Bibliothèque basée sur le vrai chemin Android, comme la première TikowikoMusic.
     * Les morceaux sont triés dossier physique -> titre et les doublons MediaStore
     * pointant sur le même fichier physique sont supprimés.
     */
    private String getSongsJson() {
        JSONArray out = new JSONArray();
        if (!hasAudioPermissionInternal()) return out.toString();

        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String folderColumnName = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? MediaStore.Audio.Media.RELATIVE_PATH
                : MediaStore.Audio.Media.DATA;

        String[] projection = new String[]{
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.MIME_TYPE,
                MediaStore.Audio.Media.DISPLAY_NAME,
                folderColumnName
        };

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sort = folderColumnName + " COLLATE NOCASE ASC, " +
                MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC, " +
                MediaStore.Audio.Media._ID + " ASC";

        Set<String> seenPhysicalFiles = new HashSet<>();
        try (Cursor c = getContentResolver().query(collection, projection, selection, null, sort)) {
            if (c == null) return out.toString();
            int idCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
            int titleCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
            int artistCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
            int albumCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
            int durationCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
            int mimeCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE);
            int displayCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
            int folderCol = c.getColumnIndexOrThrow(folderColumnName);

            while (c.moveToNext()) {
                long id = c.getLong(idCol);
                long duration = Math.max(0L, c.getLong(durationCol));
                String title = c.getString(titleCol);
                String artist = c.getString(artistCol);
                String album = c.getString(albumCol);
                String mime = c.getString(mimeCol);
                String displayName = c.getString(displayCol);
                String folder = normalizeFolder(c.getString(folderCol));

                String physicalKey = (folder + "\u0000" +
                        (displayName == null || displayName.trim().isEmpty() ? String.valueOf(id) : displayName))
                        .toLowerCase(Locale.ROOT);
                if (!seenPhysicalFiles.add(physicalKey)) continue;

                JSONObject o = new JSONObject();
                o.put("id", id);
                o.put("title", title == null || title.trim().isEmpty() ? "Sans titre" : title.trim());
                o.put("artist", artist == null || artist.trim().isEmpty() || "<unknown>".equals(artist)
                        ? "Artiste inconnu" : artist.trim());
                o.put("album", album == null || album.trim().isEmpty() ? "Album inconnu" : album.trim());
                o.put("duration", duration);
                o.put("mime", mime == null ? "audio" : mime);
                o.put("folder", folder);
                o.put("fileName", displayName == null ? "" : displayName);
                o.put("uri", ContentUris.withAppendedId(collection, id).toString());
                out.put(o);
            }
        } catch (Exception ignored) {}
        return out.toString();
    }

    private JSONObject buildPhysicalFolderQueue(String selectedUri, String fallbackTitle, String fallbackArtist) {
        JSONObject payload = new JSONObject();
        JSONArray queue = new JSONArray();
        int selectedIndex = 0;
        try {
            JSONArray all = new JSONArray(getSongsJson());
            String folder = null;
            for (int i = 0; i < all.length(); i++) {
                JSONObject song = all.optJSONObject(i);
                if (song != null && selectedUri.equals(song.optString("uri"))) {
                    folder = song.optString("folder", "Musique");
                    break;
                }
            }
            if (folder != null) {
                for (int i = 0; i < all.length(); i++) {
                    JSONObject song = all.optJSONObject(i);
                    if (song == null || !folder.equals(song.optString("folder", "Musique"))) continue;
                    JSONObject q = new JSONObject();
                    q.put("uri", song.optString("uri"));
                    q.put("title", song.optString("title", "Sans titre"));
                    q.put("artist", song.optString("artist", "Artiste inconnu"));
                    q.put("folder", folder);
                    if (selectedUri.equals(song.optString("uri"))) selectedIndex = queue.length();
                    queue.put(q);
                }
            }
        } catch (Exception ignored) {}

        if (queue.length() == 0) {
            try {
                JSONObject q = new JSONObject();
                q.put("uri", selectedUri);
                q.put("title", fallbackTitle == null ? "Sans titre" : fallbackTitle);
                q.put("artist", fallbackArtist == null ? "Artiste inconnu" : fallbackArtist);
                q.put("folder", "Musique");
                queue.put(q);
            } catch (Exception ignored) {}
        }
        try {
            payload.put("queue", queue);
            payload.put("index", selectedIndex);
        } catch (Exception ignored) {}
        return payload;
    }

    private String getOutputsJson() {
        JSONArray out = new JSONArray();
        try {
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                JSONObject o = new JSONObject();
                CharSequence p = d.getProductName();
                o.put("name", p == null || p.length() == 0 ? typeName(d.getType()) : p.toString());
                o.put("type", typeName(d.getType()));
                out.put(o);
            }
        } catch (Exception ignored) {}
        return out.toString();
    }

    private String typeName(int type) {
        switch(type) {
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP: return "Bluetooth";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: return "Bluetooth appel";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES: return "Casque filaire";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: return "Kit mains libres";
            case AudioDeviceInfo.TYPE_USB_HEADSET: return "Casque USB";
            case AudioDeviceInfo.TYPE_USB_DEVICE: return "Audio USB";
            case AudioDeviceInfo.TYPE_HDMI: return "HDMI";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "Haut-parleur";
            default: return "Sortie audio";
        }
    }

    private void startPlaybackService(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
        else startService(intent);
    }

    private void command(String action) {
        startService(new Intent(this, MusicService.class).setAction(action));
    }

    private void command(String action, String key, String value) {
        startService(new Intent(this, MusicService.class).setAction(action).putExtra(key, value));
    }

    public class AndroidBridge {
        @JavascriptInterface public boolean hasAudioPermission() { return hasAudioPermissionInternal(); }
        @JavascriptInterface public void requestAudioPermission() { runOnUiThread(() -> requestAudioPermissionInternal()); }
        @JavascriptInterface public void startVoiceSearch() { runOnUiThread(() -> startVoiceSearchInternal()); }
        @JavascriptInterface public String getSongs() { return getSongsJson(); }
        @JavascriptInterface public String getAudioOutputs() { return getOutputsJson(); }

        @JavascriptInterface public void play(String uri, String title, String artist) {
            if (uri == null || uri.trim().isEmpty()) return;
            JSONObject payload = buildPhysicalFolderQueue(uri, title, artist);
            JSONArray q = payload.optJSONArray("queue");
            Intent i = new Intent(MainActivity.this, MusicService.class)
                    .setAction(MusicService.ACTION_PLAY_QUEUE)
                    .putExtra("queue", q == null ? "[]" : q.toString())
                    .putExtra("index", payload.optInt("index", 0));
            startPlaybackService(i);
        }

        @JavascriptInterface public void playQueue(String queueJson, int index) {
            Intent i = new Intent(MainActivity.this, MusicService.class)
                    .setAction(MusicService.ACTION_PLAY_QUEUE)
                    .putExtra("queue", queueJson == null ? "[]" : queueJson)
                    .putExtra("index", Math.max(0, index));
            startPlaybackService(i);
        }

        @JavascriptInterface public void pause() { command(MusicService.ACTION_PAUSE); }
        @JavascriptInterface public void resume() { command(MusicService.ACTION_RESUME); }
        @JavascriptInterface public void stop() { command(MusicService.ACTION_STOP); }
        @JavascriptInterface public void next() { command(MusicService.ACTION_NEXT); }
        @JavascriptInterface public void previous() { command(MusicService.ACTION_PREVIOUS); }
        @JavascriptInterface public void seekTo(int ms) {
            startService(new Intent(MainActivity.this, MusicService.class)
                    .setAction(MusicService.ACTION_SEEK).putExtra("ms", ms));
        }
        @JavascriptInterface public void setVolume(int percent) {
            startService(new Intent(MainActivity.this, MusicService.class)
                    .setAction(MusicService.ACTION_VOLUME).putExtra("percent", percent));
        }
        @JavascriptInterface public void setFocusMode(String mode) { command(MusicService.ACTION_FOCUS, "mode", mode); }
        @JavascriptInterface public void setAudioMode(String mode) { command(MusicService.ACTION_MODE, "mode", mode); }
        @JavascriptInterface public void setPauseOnUnplug(boolean enabled) { command(MusicService.ACTION_NOISY, "enabled", String.valueOf(enabled)); }
        @JavascriptInterface public void setNormalization(boolean enabled) { command(MusicService.ACTION_NORMALIZE, "enabled", String.valueOf(enabled)); }
        @JavascriptInterface public void setSleepTimer(String value) { command(MusicService.ACTION_SLEEP, "value", value); }
        @JavascriptInterface public String getPlaybackState() {
            MusicService m = MusicService.getInstance();
            return m == null ? "{\"playing\":false,\"position\":0,\"duration\":0}" : m.getStateJson();
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (current.get() == this) current.clear();
        super.onDestroy();
    }
}
