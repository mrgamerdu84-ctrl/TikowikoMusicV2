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

import java.lang.ref.WeakReference;

public class MainActivity extends Activity {
    private static final int REQ_AUDIO = 501;
    private static WeakReference<MainActivity> current = new WeakReference<>(null);
    private WebView webView;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true); s.setAllowContentAccess(true); s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadsImagesAutomatically(true); s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    public static void dispatchToWeb(final String javascript) {
        MainActivity a = current.get();
        if (a == null || a.webView == null) return;
        a.runOnUiThread(() -> a.webView.evaluateJavascript(javascript, null));
    }

    private boolean hasAudioPermissionInternal() {
        if (Build.VERSION.SDK_INT >= 33) return checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        return checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestAudioPermissionInternal() {
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.READ_MEDIA_AUDIO}, REQ_AUDIO);
        else requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE}, REQ_AUDIO);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_AUDIO) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            dispatchToWeb("window.onAudioPermissionResult && window.onAudioPermissionResult(" + ok + ");");
        }
    }

    private String getSongsJson() {
        JSONArray out = new JSONArray();
        if (!hasAudioPermissionInternal()) return out.toString();
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String[] projection = Build.VERSION.SDK_INT >= 29
                ? new String[]{MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.MIME_TYPE, MediaStore.Audio.Media.RELATIVE_PATH}
                : new String[]{MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST, MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.MIME_TYPE, MediaStore.Audio.Media.DATA};
        String selection = MediaStore.Audio.Media.IS_MUSIC + "!=0 AND " + MediaStore.Audio.Media.DURATION + ">1000";
        String sort = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";
        try (Cursor c = getContentResolver().query(collection, projection, selection, null, sort)) {
            if (c == null) return out.toString();
            int idCol=c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID), titleCol=c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE), artistCol=c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST), albumCol=c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM), durationCol=c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION), mimeCol=c.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE);
            int pathCol = Build.VERSION.SDK_INT >= 29 ? c.getColumnIndexOrThrow(MediaStore.Audio.Media.RELATIVE_PATH) : c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
            while (c.moveToNext()) {
                long id=c.getLong(idCol), duration=c.getLong(durationCol);
                String title=c.getString(titleCol), artist=c.getString(artistCol), album=c.getString(albumCol), mime=c.getString(mimeCol), path=c.getString(pathCol);
                JSONObject o=new JSONObject();
                o.put("id",id); o.put("title",title==null||title.isEmpty()?"Sans titre":title);
                o.put("artist",artist==null||artist.isEmpty()||"<unknown>".equals(artist)?"Artiste inconnu":artist);
                o.put("album",album==null||album.isEmpty()?"Album inconnu":album); o.put("duration",duration);
                o.put("mime",mime==null?"audio":mime); o.put("folder",path==null?"Musique":path);
                o.put("uri",ContentUris.withAppendedId(collection,id).toString()); out.put(o);
            }
        } catch (Exception ignored) {}
        return out.toString();
    }

    private String getOutputsJson() {
        JSONArray out=new JSONArray();
        try {
            AudioManager am=(AudioManager)getSystemService(AUDIO_SERVICE);
            for (AudioDeviceInfo d:am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                JSONObject o=new JSONObject(); CharSequence p=d.getProductName();
                o.put("name",p==null||p.length()==0?typeName(d.getType()):p.toString()); o.put("type",typeName(d.getType())); out.put(o);
            }
        } catch (Exception ignored) {}
        return out.toString();
    }

    private String typeName(int type) {
        switch(type){
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:return "Bluetooth";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:return "Bluetooth appel";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:return "Casque filaire";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:return "Kit mains libres";
            case AudioDeviceInfo.TYPE_USB_HEADSET:return "Casque USB";
            case AudioDeviceInfo.TYPE_USB_DEVICE:return "Audio USB";
            case AudioDeviceInfo.TYPE_HDMI:return "HDMI";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:return "Haut-parleur";
            default:return "Sortie audio";
        }
    }

    private void command(String action) { startService(new Intent(this,MusicService.class).setAction(action)); }
    private void command(String action,String key,String value) { startService(new Intent(this,MusicService.class).setAction(action).putExtra(key,value)); }

    public class AndroidBridge {
        @JavascriptInterface public boolean hasAudioPermission(){return hasAudioPermissionInternal();}
        @JavascriptInterface public void requestAudioPermission(){runOnUiThread(()->requestAudioPermissionInternal());}
        @JavascriptInterface public String getSongs(){return getSongsJson();}
        @JavascriptInterface public String getAudioOutputs(){return getOutputsJson();}
        @JavascriptInterface public void play(String uri,String title,String artist){Intent i=new Intent(MainActivity.this,MusicService.class).setAction(MusicService.ACTION_PLAY).putExtra("uri",uri).putExtra("title",title).putExtra("artist",artist);startService(i);}
        @JavascriptInterface public void pause(){command(MusicService.ACTION_PAUSE);}
        @JavascriptInterface public void resume(){command(MusicService.ACTION_RESUME);}
        @JavascriptInterface public void stop(){command(MusicService.ACTION_STOP);}
        @JavascriptInterface public void seekTo(int ms){startService(new Intent(MainActivity.this,MusicService.class).setAction(MusicService.ACTION_SEEK).putExtra("ms",ms));}
        @JavascriptInterface public void setVolume(int percent){startService(new Intent(MainActivity.this,MusicService.class).setAction(MusicService.ACTION_VOLUME).putExtra("percent",percent));}
        @JavascriptInterface public void setFocusMode(String mode){command(MusicService.ACTION_FOCUS,"mode",mode);}
        @JavascriptInterface public void setAudioMode(String mode){command(MusicService.ACTION_MODE,"mode",mode);}
        @JavascriptInterface public void setPauseOnUnplug(boolean enabled){command(MusicService.ACTION_NOISY,"enabled",String.valueOf(enabled));}
        @JavascriptInterface public void setNormalization(boolean enabled){command(MusicService.ACTION_NORMALIZE,"enabled",String.valueOf(enabled));}
        @JavascriptInterface public void setSleepTimer(String value){command(MusicService.ACTION_SLEEP,"value",value);}
        @JavascriptInterface public String getPlaybackState(){MusicService m=MusicService.getInstance();return m==null?"{\"playing\":false,\"position\":0,\"duration\":0}":m.getStateJson();}
    }

    @Override public void onBackPressed(){if(webView!=null&&webView.canGoBack())webView.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(current.get()==this)current.clear();super.onDestroy();}
}
