package com.tikowiko.musicv2;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
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
 * - la reprise est automatique quand le média externe s'arrête ;
 * - retirer un casque ou des écouteurs met toujours la musique en pause.
 *
 * Certains jeux demandent le focus audio plusieurs fois ou se déclarent en MEDIA.
 * On les détecte séparément et on protège la lecture pendant toute leur phase de démarrage.
 */
public final class ExternalMediaMonitor {
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static Context appContext;
    private static AudioManager audioManager;
    private static AudioManager.AudioPlaybackCallback callback;
    private static AudioDeviceCallback deviceCallback;
    private static boolean pausedByExternalMedia = false;
    private static volatile boolean externalMediaActive = false;
    private static volatile boolean gameAudioActive = false;
    private static boolean musicWasPlayingBeforeGame = false;
    private static int gameGuardAttempt = 0;
    private static Runnable pendingResume;
    private static Runnable gameFocusGuard;
    private static Runnable pendingHeadphonePause;

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

        deviceCallback = new AudioDeviceCallback() {
            @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                if (containsPrivateListeningDevice(removedDevices)) {
                    scheduleHeadphonePause();
                }
            }
        };

        try { audioManager.registerAudioPlaybackCallback(callback, handler); } catch (Exception ignored) {}
        try { audioManager.registerAudioDeviceCallback(deviceCallback, handler); } catch (Exception ignored) {}
        try { handle(audioManager.getActivePlaybackConfigurations()); } catch (Exception ignored) {}
    }

    public static void stop() {
        cancelPendingResume();
        cancelGameGuard();
        cancelPendingHeadphonePause();
        if (audioManager != null && callback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { audioManager.unregisterAudioPlaybackCallback(callback); } catch (Exception ignored) {}
        }
        if (audioManager != null && deviceCallback != null) {
            try { audioManager.unregisterAudioDeviceCallback(deviceCallback); } catch (Exception ignored) {}
        }
        callback = null;
        deviceCallback = null;
        audioManager = null;
        appContext = null;
        pausedByExternalMedia = false;
        externalMediaActive = false;
        gameAudioActive = false;
        musicWasPlayingBeforeGame = false;
    }

    public static boolean isExternalMediaActive() {
        return externalMediaActive;
    }

    public static boolean isGameAudioActive() {
        return gameAudioActive;
    }

    private static void handle(List<AudioPlaybackConfiguration> configs) {
        boolean hadGameAudio = gameAudioActive;
        boolean hasExternalMedia = false;
        boolean hasGameAudio = false;

        if (configs != null) {
            for (AudioPlaybackConfiguration config : configs) {
                if (isGameAudioConfiguration(config)) hasGameAudio = true;
                if (isExternalPrimaryMedia(config)) hasExternalMedia = true;
            }
        }

        MusicService service = MusicService.getInstance();
        boolean musicPlayingNow = isServicePlaying(service);

        if (!hadGameAudio && !hasGameAudio && !hasExternalMedia) {
            musicWasPlayingBeforeGame = musicPlayingNow;
        }

        gameAudioActive = hasGameAudio;
        externalMediaActive = hasExternalMedia;

        if (service == null) return;

        if (hasExternalMedia) {
            cancelGameGuard();
            cancelPendingResume();
            if (!pausedByExternalMedia) pausedByExternalMedia = service.pauseForExternalMedia();
            return;
        }

        if (hasGameAudio) {
            if (!hadGameAudio && musicPlayingNow) {
                musicWasPlayingBeforeGame = true;
            }

            // Tant qu'un jeu est détecté et que la musique jouait avant son
            // ouverture, on garde un garde-fou actif. Certains jeux volent le
            // focus plusieurs secondes après l'écran de lancement.
            if (musicWasPlayingBeforeGame && (!musicPlayingNow || gameFocusGuard == null)) {
                if (!musicPlayingNow) forceResumeForGame();
                if (gameFocusGuard == null) startGameGuard();
            }
        } else {
            cancelGameGuard();
            musicWasPlayingBeforeGame = musicPlayingNow;
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

    private static void startGameGuard() {
        cancelGameGuard();
        gameGuardAttempt = 0;
        gameFocusGuard = new Runnable() {
            @Override public void run() {
                if (!gameAudioActive || externalMediaActive || !musicWasPlayingBeforeGame || appContext == null) {
                    cancelGameGuard();
                    return;
                }

                MusicService service = MusicService.getInstance();
                if (service != null && !isServicePlaying(service)) {
                    forceResumeForGame();
                }

                // Protection longue : les jeux qui redemandent le focus après
                // leur pub, écran de chargement ou changement de scène ne doivent
                // pas tuer définitivement la musique.
                gameGuardAttempt++;
                if (gameGuardAttempt >= 60) {
                    cancelGameGuard();
                    return;
                }
                long delay = gameGuardAttempt < 8 ? 180L : 600L;
                handler.postDelayed(this, delay);
            }
        };
        handler.postDelayed(gameFocusGuard, 60L);
    }

    private static void forceResumeForGame() {
        Context context = appContext;
        if (context == null || externalMediaActive || !gameAudioActive || !musicWasPlayingBeforeGame) return;
        try {
            Intent resume = new Intent(context, MusicService.class)
                    .setAction(MusicService.ACTION_RESUME);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(resume);
            else context.startService(resume);
        } catch (Exception ignored) {}
    }

    private static void scheduleHeadphonePause() {
        cancelPendingHeadphonePause();
        pendingHeadphonePause = () -> {
            pendingHeadphonePause = null;

            // Petit délai pour laisser Android stabiliser le routage audio.
            // Si un autre casque/écouteur est encore connecté, on ne coupe pas.
            if (hasPrivateListeningOutputConnected()) return;

            MusicService service = MusicService.getInstance();
            if (service == null || !isServicePlaying(service) || appContext == null) return;

            cancelGameGuard();
            musicWasPlayingBeforeGame = false;
            try {
                Intent pause = new Intent(appContext, MusicService.class)
                        .setAction(MusicService.ACTION_PAUSE);
                appContext.startService(pause);
            } catch (Exception ignored) {}
        };
        handler.postDelayed(pendingHeadphonePause, 350L);
    }

    private static boolean containsPrivateListeningDevice(AudioDeviceInfo[] devices) {
        if (devices == null) return false;
        for (AudioDeviceInfo device : devices) {
            if (isPrivateListeningDevice(device)) return true;
        }
        return false;
    }

    private static boolean hasPrivateListeningOutputConnected() {
        AudioManager manager = audioManager;
        if (manager == null) return false;
        try {
            AudioDeviceInfo[] outputs = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo output : outputs) {
                if (isPrivateListeningDevice(output)) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private static boolean isPrivateListeningDevice(AudioDeviceInfo device) {
        if (device == null || !device.isSink()) return false;
        switch (device.getType()) {
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case AudioDeviceInfo.TYPE_HEARING_AID:
                return true;
            default:
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                        device.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET) return true;
                return false;
        }
    }

    private static boolean isServicePlaying(MusicService service) {
        if (service == null) return false;
        try {
            String state = service.getStateJson();
            return state != null && state.contains("\"playing\":true");
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean isGameAudioConfiguration(AudioPlaybackConfiguration configuration) {
        if (configuration == null) return false;
        AudioAttributes attributes = configuration.getAudioAttributes();
        if (attributes == null) return false;

        int uid = clientUidCompat(configuration);
        if (uid == Process.myUid()) return false;

        if (attributes.getUsage() == AudioAttributes.USAGE_GAME) return true;
        if (uid >= 0 && isGameUid(uid)) return true;

        // Certains jeux anciens ou mal déclarés se présentent comme MEDIA sans
        // UID exploitable. MUSIC/SONIFICATION/UNKNOWN est alors traité comme
        // audio de jeu pour éviter une coupure brutale. MOVIE/SPEECH reste
        // réservé aux vidéos et lecteurs comme Netflix.
        if (uid < 0 && attributes.getUsage() == AudioAttributes.USAGE_MEDIA) {
            int content = attributes.getContentType();
            return content == AudioAttributes.CONTENT_TYPE_MUSIC ||
                    content == AudioAttributes.CONTENT_TYPE_SONIFICATION ||
                    content == AudioAttributes.CONTENT_TYPE_UNKNOWN;
        }
        return false;
    }

    private static boolean isExternalPrimaryMedia(AudioPlaybackConfiguration configuration) {
        if (configuration == null) return false;
        AudioAttributes attributes = configuration.getAudioAttributes();
        if (attributes == null) return false;

        if (attributes.getUsage() == AudioAttributes.USAGE_GAME) return false;
        if (attributes.getUsage() != AudioAttributes.USAGE_MEDIA) return false;

        int uid = clientUidCompat(configuration);
        if (uid == Process.myUid()) return false;
        if (uid >= 0) {
            if (isGameUid(uid)) return false;
            return true;
        }

        int content = attributes.getContentType();
        return content == AudioAttributes.CONTENT_TYPE_MOVIE ||
                content == AudioAttributes.CONTENT_TYPE_SPEECH;
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
                boolean categoryGame = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                        info.category == ApplicationInfo.CATEGORY_GAME;
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

    private static void cancelPendingHeadphonePause() {
        if (pendingHeadphonePause != null) handler.removeCallbacks(pendingHeadphonePause);
        pendingHeadphonePause = null;
    }

    private static void cancelGameGuard() {
        if (gameFocusGuard != null) handler.removeCallbacks(gameFocusGuard);
        gameFocusGuard = null;
        gameGuardAttempt = 0;
    }
}
