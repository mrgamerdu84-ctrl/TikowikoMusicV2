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
import android.content.SharedPreferences;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MusicService extends Service {
    public static final String ACTION_PLAY = "tw.PLAY";
    public static final String ACTION_PLAY_QUEUE = "tw.PLAY_QUEUE";
    public static final String ACTION_PAUSE = "tw.PAUSE";
    public static final String ACTION_RESUME = "tw.RESUME";
    public static final String ACTION_STOP = "tw.STOP";
    public static final String ACTION_NEXT = "tw.NEXT";
    public static final String ACTION_PREVIOUS = "tw.PREVIOUS";
    public static final String ACTION_TOGGLE = "tw.TOGGLE";
    public static final String ACTION_SEEK = "tw.SEEK";
    public static final String ACTION_VOLUME = "tw.VOLUME";
    public static final String ACTION_FOCUS = "tw.FOCUS";
    public static final String ACTION_MODE = "tw.MODE";
    public static final String ACTION_NOISY = "tw.NOISY";
    public static final String ACTION_NORMALIZE = "tw.NORMALIZE";
    public static final String ACTION_SLEEP = "tw.SLEEP";

    private static final int NOTIF_ID = 44;
    private static final String CHANNEL = "tikowiko_music";
    private static final String PREFS = "tikowiko_playback_session";
    private static MusicService instance;

    private static class Track {
        final String uri;
        final String title;
        final String artist;
        final String folder;

        Track(String uri, String title, String artist, String folder) {
            this.uri = uri == null ? "" : uri;
            this.title = title == null || title.trim().isEmpty() ? "Sans titre" : title;
            this.artist = artist == null || artist.trim().isEmpty() ? "Artiste inconnu" : artist;
            this.folder = folder == null || folder.trim().isEmpty() ? "Musique" : folder;
        }

        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("uri", uri);
                o.put("title", title);
                o.put("artist", artist);
                o.put("folder", folder);
            } catch (Exception ignored) {}
            return o;
        }
    }

    private MediaPlayer player;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Track> queue = new ArrayList<>();
    private int queueIndex = -1;
    private int pendingStartPosition = 0;
    private boolean pendingAutoStart = true;
    private Runnable sleepRunnable;
    private final Runnable progressSaver = new Runnable() {
        @Override public void run() {
            persistSession();
            handler.postDelayed(this, 5000L);
        }
    };

    private float userVolume = .78f;
    private boolean prepared = false;
    private boolean pausedByFocus = false;
    private boolean pausedByExternalMedia = false;
    private boolean ducked = false;
    private boolean pauseOnUnplug = true;
    private boolean normalize = true;
    private boolean stopAtEnd = false;
    private boolean sessionWantsPlayback = false;
    private boolean explicitStopRequested = false;
    private String focusMode = "pause";
    private String audioMode = "classic";
    private String title = "tikoWiko Musique";
    private String artist = "";
    private String currentUri = "";
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
        handler.post(progressSaver);

        // Même mécanisme que la première TikowikoMusic : on restaure la session
        // et on garde le service de lecture vivant hors de l'Activity.
        if (restoreSession()) {
            Track track = currentTrack();
            if (track != null) {
                title = track.title;
                artist = track.artist;
                currentUri = track.uri;
                startForeground(NOTIF_ID, buildNotification(false));
                prepareCurrent(pendingStartPosition, pendingAutoStart);
            }
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_STICKY;
        String a = intent.getAction();
        if (ACTION_PLAY_QUEUE.equals(a)) {
            loadQueue(intent.getStringExtra("queue"), intent.getIntExtra("index", 0));
            if (currentTrack() != null) {
                explicitStopRequested = false;
                sessionWantsPlayback = true;
                startForeground(NOTIF_ID, buildNotification(false));
                prepareCurrent(0, true);
            }
        } else if (ACTION_PLAY.equals(a)) {
            queue.clear();
            queue.add(new Track(intent.getStringExtra("uri"), intent.getStringExtra("title"), intent.getStringExtra("artist"), "Musique"));
            queueIndex = 0;
            explicitStopRequested = false;
            sessionWantsPlayback = true;
            startForeground(NOTIF_ID, buildNotification(false));
            prepareCurrent(0, true);
        } else if (ACTION_PAUSE.equals(a)) pause(false);
        else if (ACTION_RESUME.equals(a)) resume();
        else if (ACTION_STOP.equals(a)) stopPlayback();
        else if (ACTION_NEXT.equals(a)) playNextInternal(false);
        else if (ACTION_PREVIOUS.equals(a)) playPreviousInternal();
        else if (ACTION_TOGGLE.equals(a)) togglePlayPause();
        else if (ACTION_SEEK.equals(a)) seek(intent.getIntExtra("ms", 0));
        else if (ACTION_VOLUME.equals(a)) setVolume(intent.getIntExtra("percent", 78));
        else if (ACTION_FOCUS.equals(a)) setFocusMode(intent.getStringExtra("mode"));
        else if (ACTION_MODE.equals(a)) setAudioMode(intent.getStringExtra("mode"));
        else if (ACTION_NOISY.equals(a)) pauseOnUnplug = Boolean.parseBoolean(intent.getStringExtra("enabled"));
        else if (ACTION_NORMALIZE.equals(a)) { normalize = Boolean.parseBoolean(intent.getStringExtra("enabled")); applyEffects(); }
        else if (ACTION_SLEEP.equals(a)) setSleep(intent.getStringExtra("value"));
        persistSession();
        return START_STICKY;
    }

    private void loadQueue(String json, int requestedIndex) {
        queue.clear();
        try {
            JSONArray arr = new JSONArray(json == null ? "[]" : json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String uri = o.optString("uri", "");
                if (uri.isEmpty()) continue;
                queue.add(new Track(uri, o.optString("title", "Sans titre"), o.optString("artist", "Artiste inconnu"), o.optString("folder", "Musique")));
            }
        } catch (Exception ignored) {}
        queueIndex = queue.isEmpty() ? -1 : Math.max(0, Math.min(requestedIndex, queue.size() - 1));
    }

    private Track currentTrack() {
        return queueIndex >= 0 && queueIndex < queue.size() ? queue.get(queueIndex) : null;
    }

    private void prepareCurrent(int startPosition, boolean autoStart) {
        Track track = currentTrack();
        if (track == null || track.uri.isEmpty()) return;

        title = track.title;
        artist = track.artist;
        currentUri = track.uri;
        pendingStartPosition = Math.max(0, startPosition);
        pendingAutoStart = autoStart;
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
            player.setDataSource(this, Uri.parse(track.uri));
            player.setOnPreparedListener(mp -> {
                prepared = true;
                if (pendingStartPosition > 0) {
                    try { mp.seekTo(pendingStartPosition); } catch (Exception ignored) {}
                }
                if (pendingAutoStart && sessionWantsPlayback) {
                    requestFocus();
                    applyEffects();
                    applyVolume();
                    try { mp.start(); } catch (Exception ignored) {}
                } else {
                    applyEffects();
                    applyVolume();
                }
                updateNotification();
                persistSession();
                dispatchTrackChanged();
                MainActivity.dispatchToWeb("window.onNativePlaybackStarted && window.onNativePlaybackStarted();");
            });
            player.setOnCompletionListener(mp -> handler.post(() -> {
                if (stopAtEnd) {
                    stopAtEnd = false;
                    sessionWantsPlayback = false;
                    updateNotification();
                    persistSession();
                    MainActivity.dispatchToWeb("window.onNativePlaybackPaused && window.onNativePlaybackPaused();");
                    return;
                }
                if (sessionWantsPlayback && queueIndex >= 0 && queueIndex + 1 < queue.size()) {
                    queueIndex++;
                    prepareCurrent(0, true);
                } else {
                    sessionWantsPlayback = false;
                    updateNotification();
                    persistSession();
                    MainActivity.dispatchToWeb("window.onNativeTrackEnded && window.onNativeTrackEnded();");
                }
            }));
            player.setOnErrorListener((mp, what, extra) -> {
                MainActivity.dispatchToWeb("window.onNativePlaybackError && window.onNativePlaybackError();");
                if (sessionWantsPlayback && queueIndex + 1 < queue.size()) {
                    handler.post(() -> { queueIndex++; prepareCurrent(0, true); });
                }
                return true;
            });
            player.prepareAsync();
        } catch (Exception e) {
            MainActivity.dispatchToWeb("window.onNativePlaybackError && window.onNativePlaybackError();");
        }
    }

    private void dispatchTrackChanged() {
        MainActivity.dispatchToWeb(
                "window.onNativeTrackChanged && window.onNativeTrackChanged(" +
                        JSONObject.quote(currentUri) + "," + JSONObject.quote(title) + "," + JSONObject.quote(artist) + ");"
        );
    }

    private void togglePlayPause() {
        try {
            if (player != null && prepared && player.isPlaying()) pause(false);
            else resume();
        } catch (Exception ignored) {}
    }

    private void pause(boolean fromFocus) {
        try {
            if (player != null && prepared && player.isPlaying()) player.pause();
            pausedByFocus = fromFocus;
            if (!fromFocus) sessionWantsPlayback = false;
            updateNotification();
            persistSession();
            MainActivity.dispatchToWeb("window.onNativePlaybackPaused && window.onNativePlaybackPaused();");
        } catch (Exception ignored) {}
    }

    private void resume() {
        try {
            if (currentTrack() == null) return;
            sessionWantsPlayback = true;
            if (player == null || !prepared) {
                startForeground(NOTIF_ID, buildNotification(false));
                prepareCurrent(pendingStartPosition, true);
                return;
            }
            if (!player.isPlaying()) {
                requestFocus();
                player.start();
                pausedByFocus = false;
                pausedByExternalMedia = false;
                ducked = false;
                applyVolume();
                updateNotification();
                persistSession();
                MainActivity.dispatchToWeb("window.onNativePlaybackStarted && window.onNativePlaybackStarted();");
            }
        } catch (Exception ignored) {}
    }

    private void playNextInternal(boolean fromCompletion) {
        if (queue.isEmpty()) return;
        if (queueIndex + 1 >= queue.size()) {
            if (!fromCompletion) queueIndex = 0;
            else return;
        } else {
            queueIndex++;
        }
        sessionWantsPlayback = true;
        startForeground(NOTIF_ID, buildNotification(false));
        prepareCurrent(0, true);
    }

    private void playPreviousInternal() {
        if (queue.isEmpty()) return;
        try {
            if (player != null && prepared && player.getCurrentPosition() > 4000) {
                seek(0);
                return;
            }
        } catch (Exception ignored) {}
        queueIndex = queueIndex <= 0 ? queue.size() - 1 : queueIndex - 1;
        sessionWantsPlayback = true;
        startForeground(NOTIF_ID, buildNotification(false));
        prepareCurrent(0, true);
    }

    public boolean pauseForExternalMedia() {
        if ("keep".equals(focusMode)) return false;
        try {
            if (player != null && prepared && player.isPlaying()) {
                player.pause();
                pausedByExternalMedia = true;
                pausedByFocus = false;
                // On garde sessionWantsPlayback=true pour reprendre ensuite.
                updateNotification();
                persistSession();
                MainActivity.dispatchToWeb("window.onNativePlaybackPaused && window.onNativePlaybackPaused();");
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    public void resumeAfterExternalMedia() {
        if (!pausedByExternalMedia) return;
        try {
            if (player != null && prepared && !player.isPlaying() && sessionWantsPlayback) {
                requestFocus();
                player.start();
                pausedByExternalMedia = false;
                pausedByFocus = false;
                ducked = false;
                applyVolume();
                updateNotification();
                persistSession();
                MainActivity.dispatchToWeb("window.onNativePlaybackStarted && window.onNativePlaybackStarted();");
            }
        } catch (Exception ignored) {}
    }

    private void stopPlayback() {
        explicitStopRequested = true;
        sessionWantsPlayback = false;
        pausedByFocus = false;
        pausedByExternalMedia = false;
        ducked = false;
        queue.clear();
        queueIndex = -1;
        currentUri = "";
        releasePlayerOnly();
        abandonFocus();
        clearSession();
        stopForeground(true);
        stopSelf();
    }

    private void seek(int ms) {
        try {
            pendingStartPosition = Math.max(0, ms);
            if (player != null && prepared) player.seekTo(pendingStartPosition);
            persistSession();
        } catch (Exception ignored) {}
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
            if (pausedByFocus && !pausedByExternalMedia && sessionWantsPlayback) resume();
            else pausedByFocus = false;
            return;
        }
        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            if ("duck".equals(focusMode)) { ducked = true; applyVolume(); }
            else { ducked = false; applyVolume(); }
            return;
        }
        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            pause(true);
            return;
        }
        if (change == AudioManager.AUDIOFOCUS_LOSS) {
            pausedByFocus = false;
            if ("duck".equals(focusMode)) { ducked = true; applyVolume(); }
            else {
                ducked = false;
                applyVolume();
                try {
                    if ("keep".equals(focusMode) && player != null && prepared && !pausedByExternalMedia && sessionWantsPlayback && !player.isPlaying()) {
                        player.start();
                        updateNotification();
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
            o.put("position", player != null && prepared ? player.getCurrentPosition() : pendingStartPosition);
            o.put("duration", player != null && prepared ? player.getDuration() : 0);
            o.put("title", title);
            o.put("artist", artist);
            o.put("uri", currentUri);
            o.put("queueIndex", queueIndex);
            o.put("queueSize", queue.size());
        } catch (Exception ignored) {}
        return o.toString();
    }

    private JSONArray queueJson() {
        JSONArray arr = new JSONArray();
        for (Track track : queue) arr.put(track.toJson());
        return arr;
    }

    private void persistSession() {
        if (explicitStopRequested || queue.isEmpty() || queueIndex < 0) return;
        int position = pendingStartPosition;
        try { if (player != null && prepared) position = player.getCurrentPosition(); } catch (Exception ignored) {}
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putBoolean("active", true)
                .putString("queue", queueJson().toString())
                .putInt("index", queueIndex)
                .putInt("position", Math.max(0, position))
                .putBoolean("wants", sessionWantsPlayback)
                .apply();
    }

    private boolean restoreSession() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!prefs.getBoolean("active", false)) return false;
        loadQueue(prefs.getString("queue", "[]"), prefs.getInt("index", 0));
        if (currentTrack() == null) return false;
        pendingStartPosition = Math.max(0, prefs.getInt("position", 0));
        sessionWantsPlayback = prefs.getBoolean("wants", false);
        pendingAutoStart = sessionWantsPlayback;
        explicitStopRequested = false;
        return true;
    }

    private void clearSession() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            NotificationChannel c = new NotificationChannel(CHANNEL, "Lecture musicale", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Lecture audio en arrière-plan");
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
    }

    private PendingIntent servicePendingIntent(String action, int requestCode) {
        Intent i = new Intent(this, MusicService.class).setAction(action);
        return PendingIntent.getService(this, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildNotification(boolean playing) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        int playIcon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        return b.setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(artist.isEmpty() ? "tikoWiko Musique" : artist)
                .setSubText(currentTrack() == null ? null : currentTrack().folder)
                .setContentIntent(pi)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(currentTrack() != null)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .addAction(android.R.drawable.ic_media_previous, "Précédent", servicePendingIntent(ACTION_PREVIOUS, 1))
                .addAction(playIcon, playing ? "Pause" : "Lecture", servicePendingIntent(ACTION_TOGGLE, 2))
                .addAction(android.R.drawable.ic_media_next, "Suivant", servicePendingIntent(ACTION_NEXT, 3))
                .build();
    }

    private void updateNotification() {
        try {
            boolean playing = player != null && prepared && player.isPlaying();
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.notify(NOTIF_ID, buildNotification(playing));
        } catch (Exception ignored) {}
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        // Ne surtout pas arrêter la lecture quand l'utilisateur enlève l'app des récents.
        persistSession();
        if (currentTrack() != null) {
            try { startForeground(NOTIF_ID, buildNotification(player != null && prepared && player.isPlaying())); } catch (Exception ignored) {}
        }
        super.onTaskRemoved(rootIntent);
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
        handler.removeCallbacks(progressSaver);
        if (sleepRunnable != null) handler.removeCallbacks(sleepRunnable);
        if (!explicitStopRequested) persistSession();
        try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
        ExternalMediaMonitor.stop();
        releasePlayerOnly();
        abandonFocus();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
