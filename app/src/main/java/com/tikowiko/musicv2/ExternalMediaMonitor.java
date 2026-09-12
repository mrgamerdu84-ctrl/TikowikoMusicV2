package com.tikowiko.musicv2;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.AudioPlaybackConfiguration;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;

import java.lang.reflect.Method;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reprise du comportement de la première TikowikoMusic :
 * - les jeux et notifications ne coupent pas la musique ;
 * - une vraie lecture vidéo/média peut mettre en pause si le mode Focus n'est pas "keep" ;
 * - la reprise est automatique quand le média externe s'arrête.
 */
public final class ExternalMediaMonitor {
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static Context appContext;
    private static AudioManager audioManager;
    private static AudioManager.AudioPlaybackCallback callback;
    private static boolean pausedByExternalMedia = false;
    private static boolean externalMediaActive = false;
    private static Runnable pendingResume;

    private ExternalMediaMonitor() {}

    public static void start(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || callback != null) return;
        appContext = context.getApplicationContext();
        audioManager = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;

        callback = new AudioManager.AudioPlaybackCallback() {
            @Override public void onPlaybackConfigChanged(List<AudioPlaybackConfiguration> configs) {
                handle(configs);
            }
        };

        try { audioManager.registerAudioPlaybackCallback(callback, handler); } catch (Exception ignored) {}
        try { handle(audioManager.getActivePlaybackConfigurations()); } catch (Exception ignored) {}
    }

    public static void stop() {
        cancelPendingResume();
        if (audioManager != null && callback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { audioManager.unregisterAudioPlaybackCallback(callback); } catch (Exception ignored) {}
        }
        callback = null;
        audioManager = null;
        appContext = null;
        pausedByExternalMedia = false;
        externalMediaActive = false;
    }

    private static void handle(List<AudioPlaybackConfiguration> configs) {
        boolean hasExternalMedia = false;
        if (configs != null) {
            for (AudioPlaybackConfiguration config : configs) {
                if (isExternalPrimaryMedia(config)) {
                    hasExternalMedia = true;
                    break;
                }
            }
        }
        externalMediaActive = hasExternalMedia;

        MusicService service = MusicService.getInstance();
        if (service == null) return;

        if (hasExternalMedia) {
            cancelPendingResume();
            if (!pausedByExternalMedia) pausedByExternalMedia = service.pauseForExternalMedia();
            return;
        }

        if (!pausedByExternalMedia || pendingResume != null) return;
        pendingResume = () -> {
            pendingResume = null;
            MusicService current = MusicService.getInstance();
            if (pausedByExternalMedia && !externalMediaActive && current != null) {
                pausedByExternalMedia = false;
                current.resumeAfterExternalMedia();
            }
        };
        handler.postDelayed(pendingResume, 700L);
    }

    private static boolean isExternalPrimaryMedia(AudioPlaybackConfiguration configuration) {
        if (configuration == null) return false;
        AudioAttributes attributes = configuration.getAudioAttributes();
        if (attributes == null) return false;

        // Même règle que l'ancienne application : un jeu ne doit pas couper la musique.
        if (attributes.getUsage() == AudioAttributes.USAGE_GAME) return false;
        if (attributes.getUsage() != AudioAttributes.USAGE_MEDIA) return false;

        int uid = clientUidCompat(configuration);
        if (uid == Process.myUid()) return false;
        if (uid >= 0) {
            if (isGameUid(uid)) return false;
            return true;
        }

        // Repli prudent quand Android masque l'UID : vidéo/parole oui, musique/sonification non.
        int content = attributes.getContentType();
        return content == AudioAttributes.CONTENT_TYPE_MOVIE || content == AudioAttributes.CONTENT_TYPE_SPEECH;
    }

    private static int clientUidCompat(AudioPlaybackConfiguration configuration) {
        try {
            for (Method method : configuration.getClass().getMethods()) {
                if ("getClientUid".equals(method.getName()) && method.getParameterTypes().length == 0) {
                    Object value = method.invoke(configuration);
                    if (value instanceof Number) {
                        int uid = ((Number) value).intValue();
                        if (uid >= 0) return uid;
                    }
                }
            }
        } catch (Exception ignored) {}

        String text;
        try { text = configuration.toString(); } catch (Exception e) { text = ""; }
        Pattern[] patterns = new Pattern[] {
                Pattern.compile("u/pid[:=]\\s*(\\d+)/"),
                Pattern.compile("uid[:=]\\s*(\\d+)", Pattern.CASE_INSENSITIVE)
        };
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(text);
            if (matcher.find()) {
                try {
                    int uid = Integer.parseInt(matcher.group(1));
                    if (uid >= 0) return uid;
                } catch (Exception ignored) {}
            }
        }
        return -1;
    }

    private static boolean isGameUid(int uid) {
        Context context = appContext;
        if (context == null) return false;
        PackageManager pm = context.getPackageManager();
        String[] packages;
        try { packages = pm.getPackagesForUid(uid); } catch (Exception e) { packages = null; }
        if (packages == null) return false;

        for (String packageName : packages) {
            try {
                ApplicationInfo info;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    info = pm.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(0L));
                } else {
                    //noinspection deprecation
                    info = pm.getApplicationInfo(packageName, 0);
                }
                boolean categoryGame = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && info.category == ApplicationInfo.CATEGORY_GAME;
                //noinspection deprecation
                boolean legacyGame = (info.flags & ApplicationInfo.FLAG_IS_GAME) != 0;
                if (categoryGame || legacyGame) return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    private static void cancelPendingResume() {
        if (pendingResume != null) handler.removeCallbacks(pendingResume);
        pendingResume = null;
    }
}