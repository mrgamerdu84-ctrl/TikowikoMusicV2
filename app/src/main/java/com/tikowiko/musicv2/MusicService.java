package com.tikowiko.musicv2;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.audiofx.BassBoost;
import android.media.audiofx.LoudnessEnhancer;
import android.media.audiofx.Virtualizer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONObject;

public class MusicService extends Service {
    public static final String ACTION_PLAY = "tw.PLAY";
    public static final String ACTION_PAUSE = "tw.PAUSE";
    public static final String ACTION_RESUME = "tw.RESUME";
    public static final String ACTION_STOP = "tw.STOP";
    public static final String ACTION_SEEK = "tw.SEEK";
    public static final String ACTION_VOLUME = "tw.VOLUME";
    public static final String ACTION_FOCUS = "tw.FOCUS";
    public static final String ACTION_MODE = "tw.MODE";
    public static final String ACTION_NOISY = "tw.NOISY";
    public static final String ACTION_NORMALIZE = "tw.NORMALIZE";
    public static final String ACTION_SLEEP = "tw.SLEEP";

    private static final int NOTIF_ID = 44;
    private static final String CHANNEL = "tikowiko_music";
    private static MusicService instance;

    private MediaPlayer player;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable sleepRunnable;
    private float userVolume = .78f;
    private boolean prepared = false;
    private boolean pausedByFocus = false;
    private boolean pausedByExternalMedia = false;
    private boolean ducked = false;
    private boolean pauseOnUnplug = true;
    private boolean normalize = true;
    private boolean stopAtEnd = false;
    private String focusMode = "pause";
    private String audioMode = "classic";
    private String title = "tikoWiko Musique";
    private String artist = "";
    private BassBoost bassBoost;
    private Virtualizer virtualizer;
    private LoudnessEnhancer loudnessEnhancer;

    public static MusicService getInstance() { return instance; }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        createChannel();
        IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisyReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(noisyReceiver, f);
        ExternalMediaMonitor.start(this);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_STICKY;
        String a = intent.getAction();
        if (ACTION_PLAY.equals(a)) {
            startForeground(NOTIF_ID, buildNotification(false));
            play(intent.getStringExtra("uri"), intent.getStringExtra("title"), intent.getStringExtra("artist"));
        } else if (ACTION_PAUSE.equals(a)) pause(false);
        else if (ACTION_RESUME.equals(a)) resume();
        else if (ACTION_STOP.equals(a)) stopPlayback();
        else if (ACTION_SEEK.equals(a)) seek(intent.getIntExtra("ms", 0));
        else if (ACTION_VOLUME.equals(a)) setVolume(intent.getIntExtra("percent", 78));
        else if (ACTION_FOCUS.equals(a)) setFocusMode(intent.getStringExtra("mode"));
        else if (ACTION_MODE.equals(a)) setAudioMode(intent.getStringExtra("mode"));
        else if (ACTION_NOISY.equals(a)) pauseOnUnplug = Boolean.parseBoolean(intent.getStringExtra("enabled"));
        else if (ACTION_NORMALIZE.equals(a)) { normalize = Boolean.parseBoolean(intent.getStringExtra("enabled")); applyEffects(); }
        else if (ACTION_SLEEP.equals(a)) setSleep(intent.getStringExtra("value"));
        return START_STICKY;
    }

    private void play(String uri, String t, String ar) {
        if (uri == null) return;
        title = t == null ? "Sans titre" : t;
        artist = ar == null ? "" : ar;
        stopAtEnd = false;
        pausedByFocus = false;
        pausedByExternalMedia = false;
        ducked = false;
        releasePlayerOnly();
        player = new MediaPlayer();
        prepared = false;
        try {
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            player.setDataSource(this, Uri.parse(uri));
            player.setOnPreparedListener(mp -> {
                prepared = true;
                requestFocus();
                applyEffects();
                applyVolume();
                mp.start();
                updateNotification();
                MainActivity.dispatchToWeb("window.onNativePlaybackStarted && window.onNativePlaybackStarted();");
            });
            player.setOnCompletionListener(mp -> {
                if (stopAtEnd) {
                    pause(false);
                    stopAtEnd = false;
                } else {
                    MainActivity.dispatchToWeb("window.onNativeTrackEnded && window.onNativeTrackEnded();");
                }
            });
            player.setOnErrorListener((mp, what, extra) -> {
                MainActivity.dispatchToWeb("window.onNativePlaybackError && window.onNativePlaybackError();");
                return true;
            });
            player.prepareAsync();
        } catch (Exception e) {
            MainActivity.dispatchToWeb("window.onNativePlaybackError && window.onNativePlaybackError();");
        }
    }

    private void pause(boolean fromFocus) {
        try {
            if (player != null && prepared && player.isPlaying()) player.pause();
            pausedByFocus = fromFocus;
            updateNotification();
            MainActivity.dispatchToWeb("window.onNativePlaybackPaused && window.onNativePlaybackPaused();");
        } catch (Exception ignored) {}
    }

    private void resume() {
        try {
            if (player != null && prepared && !player.isPlaying()) {
                requestFocus();
                player.start();
                pausedByFocus = false;
                pausedByExternalMedia = false;
                ducked = false;
                applyVolume();
                updateNotification();
                MainActivity.dispatchToWeb("window.onNativePlaybackStarted && window.onNativePlaybackStarted();");
            }
        } catch (Exception ignored) {}
    }

    public boolean pauseForExternalMedia() {
        if ("keep".equals(focusMode)) return false;
        try {
            if (player != null && prepared && player.isPlaying()) {
                player.pause();
                pausedByExternalMedia = true;
                pausedByFocus = false;
                updateNotification();
                MainActivity.dispatchToWeb("window.onNativePlaybackPaused && window.onNativePlaybackPaused();");
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    public void resumeAfterExternalMedia() {
        if (!pausedByExternalMedia) return;
        try {
            if (player != null && prepared && !player.isPlaying()) {
                requestFocus();
                player.start();
                pausedByExternalMedia = false;
                pausedByFocus = false;
                ducked = false;
                applyVolume();
                updateNotification();
                MainActivity.dispatchToWeb("window.onNativePlaybackStarted && window.onNativePlaybackStarted();");
            }
        } catch (Exception ignored) {}
    }

    private void stopPlayback() {
        pausedByFocus = false;
        pausedByExternalMedia = false;
        ducked = false;
        releasePlayerOnly();
        abandonFocus();
        stopForeground(true);
        stopSelf();
    }

    private void seek(int ms) {
        try { if (player != null && prepared) player.seekTo(Math.max(0, ms)); } catch (Exception ignored) {}
    }

    private void setVolume(int percent) {
        userVolume = Math.max(0f, Math.min(1f, percent / 100f));
        applyVolume();
    }

    private void setFocusMode(String mode) {
        if ("duck".equals(mode) || "keep".equals(mode) || "pause".equals(mode)) {
            focusMode = mode;
            if ("keep".equals(mode) && pausedByExternalMedia) resumeAfterExternalMedia();
        }
    }

    private void setAudioMode(String mode) {
        audioMode = mode == null ? "classic" : mode;
        applyEffects();
    }

    private void setSleep(String value) {
        if (sleepRunnable != null) handler.removeCallbacks(sleepRunnable);
        sleepRunnable = null;
        stopAtEnd = false;
        if (value == null || "off".equals(value)) return;
        if ("end".equals(value)) { stopAtEnd = true; return; }
        long delay = "15".equals(value) ? 15L * 60_000L : "30".equals(value) ? 30L * 60_000L : 0;
        if (delay > 0) {
            sleepRunnable = () -> pause(false);
            handler.postDelayed(sleepRunnable, delay);
        }
    }

    private void requestFocus() {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(attrs)
                        .setAcceptsDelayedFocusGain(false)
                        .setWillPauseWhenDucked(false)
                        .setOnAudioFocusChangeListener(focusListener, handler)
                        .build();
                audioManager.requestAudioFocus(focusRequest);
            } else {
                audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            }
        } catch (Exception ignored) {}
    }

    private void abandonFocus() {
        try {
            if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) audioManager.abandonAudioFocusRequest(focusRequest);
            else audioManager.abandonAudioFocus(focusListener);
        } catch (Exception ignored) {}
    }

    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change == AudioManager.AUDIOFOCUS_GAIN) {
            if (ducked) { ducked = false; applyVolume(); }
            if (pausedByFocus && !pausedByExternalMedia) resume();
            else pausedByFocus = false;
            return;
        }

        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            // Comme TikowikoMusic : les notifications ne doivent pas couper le morceau.
            if ("duck".equals(focusMode)) {
                ducked = true;
                applyVolume();
            } else {
                ducked = false;
                applyVolume();
            }
            return;
        }

        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            // Interruption temporaire forte (appel, assistant, etc.) : pause puis reprise.
            pause(true);
            return;
        }

        if (change == AudioManager.AUDIOFOCUS_LOSS) {
            // Un jeu peut provoquer LOSS alors qu'il ne faut pas couper la musique.
            // On ne met donc pas en pause ici. ExternalMediaMonitor décide si c'est
            // réellement une vidéo / un lecteur média. Le mode "keep" l'ignore.
            pausedByFocus = false;
            if ("duck".equals(focusMode)) {
                ducked = true;
                applyVolume();
            } else {
                ducked = false;
                applyVolume();
                try {
                    if ("keep".equals(focusMode) && player != null && prepared && !pausedByExternalMedia && !player.isPlaying()) {
                        player.start();
                        updateNotification();
                        MainActivity.dispatchToWeb("window.onNativePlaybackStarted && window.onNativePlaybackStarted();");
                    }
                } catch (Exception ignored) {}
            }
        }
    };

    private void applyVolume() {
        try {
            float v = ducked ? userVolume * .25f : userVolume;
            if ("night".equals(audioMode)) v *= .7f;
            if (player != null) player.setVolume(v, v);
        } catch (Exception ignored) {}
    }

    private void releaseEffects() {
        try { if (bassBoost != null) bassBoost.release(); } catch (Exception ignored) {}
        try { if (virtualizer != null) virtualizer.release(); } catch (Exception ignored) {}
        try { if (loudnessEnhancer != null) loudnessEnhancer.release(); } catch (Exception ignored) {}
        bassBoost = null; virtualizer = null; loudnessEnhancer = null;
    }

    private void applyEffects() {
        releaseEffects();
        if (player == null || !prepared) return;
        int session = player.getAudioSessionId();
        try {
            if (normalize) {
                loudnessEnhancer = new LoudnessEnhancer(session);
                loudnessEnhancer.setTargetGain(250);
                loudnessEnhancer.setEnabled(true);
            }
        } catch (Exception ignored) {}
        try {
            if ("bass".equals(audioMode)) {
                bassBoost = new BassBoost(0, session);
                if (bassBoost.getStrengthSupported()) bassBoost.setStrength((short) 800);
                bassBoost.setEnabled(true);
            } else if ("stage".equals(audioMode)) {
                virtualizer = new Virtualizer(0, session);
                if (virtualizer.getStrengthSupported()) virtualizer.setStrength((short) 700);
                virtualizer.setEnabled(true);
            }
        } catch (Exception ignored) {}
        applyVolume();
    }

    public String getStateJson() {
        JSONObject o = new JSONObject();
        try {
            boolean playing = player != null && prepared && player.isPlaying();
            o.put("playing", playing);
            o.put("position", player != null && prepared ? player.getCurrentPosition() : 0);
            o.put("duration", player != null && prepared ? player.getDuration() : 0);
            o.put("title", title);
            o.put("artist", artist);
        } catch (Exception ignored) {}
        return o.toString();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            NotificationChannel c = new NotificationChannel(CHANNEL, "Lecture musicale", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Lecture audio en arrière-plan");
            nm.createNotificationChannel(c);
        }
    }

    private Notification buildNotification(boolean playing) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(artist.isEmpty() ? "tikoWiko Musique" : artist)
                .setContentIntent(pi)
                .setOngoing(playing)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .build();
    }

    private void updateNotification() {
        try {
            boolean playing = player != null && prepared && player.isPlaying();
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.notify(NOTIF_ID, buildNotification(playing));
        } catch (Exception ignored) {}
    }

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (pauseOnUnplug && AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) pause(false);
        }
    };

    private void releasePlayerOnly() {
        releaseEffects();
        try { if (player != null) { player.reset(); player.release(); } } catch (Exception ignored) {}
        player = null;
        prepared = false;
    }

    @Override public void onDestroy() {
        if (sleepRunnable != null) handler.removeCallbacks(sleepRunnable);
        try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
        ExternalMediaMonitor.stop();
        releasePlayerOnly();
        abandonFocus();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
