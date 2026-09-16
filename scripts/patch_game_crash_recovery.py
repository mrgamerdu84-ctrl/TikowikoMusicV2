from pathlib import Path

service_path = Path('app/src/main/java/com/tikowiko/musicv2/MusicService.java')
monitor_path = Path('app/src/main/java/com/tikowiko/musicv2/ExternalMediaMonitor.java')
service = service_path.read_text(encoding='utf-8')
monitor = monitor_path.read_text(encoding='utf-8')

# The player may be interrupted by a game, but a manual pause must always win.
service_marker = '    public String getStateJson() {\n'
service_method = '''    public boolean shouldResumeAfterGameInterruption() {\n        return currentTrack() != null && sessionWantsPlayback &&\n                !pausedByExternalMedia && !explicitStopRequested;\n    }\n\n'''
if service_method not in service:
    if service_marker not in service:
        raise SystemExit('MusicService state marker not found')
    service = service.replace(service_marker, service_method + service_marker, 1)

# Remember game audio for a short grace period. A crashing game often vanishes
# before Android returns AUDIOFOCUS_GAIN, which is exactly when music used to stop.
field_marker = '    private static Runnable pendingHeadphonePause;\n'
field_new = '''    private static Runnable pendingHeadphonePause;\n    private static Runnable gameExitRecovery;\n    private static int gameExitRecoveryAttempt = 0;\n    private static volatile long lastGameAudioSeenAt = 0L;\n'''
if 'lastGameAudioSeenAt' not in monitor:
    if field_marker not in monitor:
        raise SystemExit('ExternalMediaMonitor field marker not found')
    monitor = monitor.replace(field_marker, field_new, 1)

assign_marker = '''        gameAudioActive = hasGameAudio;\n        externalMediaActive = hasExternalMedia;\n'''
assign_new = '''        gameAudioActive = hasGameAudio;\n        if (hasGameAudio) lastGameAudioSeenAt = System.currentTimeMillis();\n        externalMediaActive = hasExternalMedia;\n'''
if assign_marker in monitor and 'if (hasGameAudio) lastGameAudioSeenAt' not in monitor:
    monitor = monitor.replace(assign_marker, assign_new, 1)

active_marker = '''    public static boolean isGameAudioActive() {\n        return gameAudioActive;\n    }\n'''
active_new = '''    public static boolean isGameAudioActive() {\n        return gameAudioActive;\n    }\n\n    public static boolean isGameAudioActiveOrRecent() {\n        return gameAudioActive || (lastGameAudioSeenAt > 0L &&\n                System.currentTimeMillis() - lastGameAudioSeenAt < 10_000L);\n    }\n'''
if 'isGameAudioActiveOrRecent()' not in monitor:
    if active_marker not in monitor:
        raise SystemExit('game active marker not found')
    monitor = monitor.replace(active_marker, active_new, 1)

stop_anchor = '        cancelPendingHeadphonePause();\n'
stop_section = monitor.split('public static void stop()', 1)[1].split('if (audioManager', 1)[0] if 'public static void stop()' in monitor else ''
if 'cancelGameExitRecovery();' not in stop_section:
    monitor = monitor.replace(stop_anchor, stop_anchor + '        cancelGameExitRecovery();\n', 1)

old_else = '''        } else {\n            cancelGameGuard();\n            musicWasPlayingBeforeGame = musicPlayingNow;\n        }\n\n        if (!pausedByExternalMedia || pendingResume != null) return;\n'''
new_else = '''        } else {\n            cancelGameGuard();\n            if (hadGameAudio && musicWasPlayingBeforeGame && !musicPlayingNow &&\n                    service.shouldResumeAfterGameInterruption()) {\n                scheduleGameExitRecovery();\n            } else if (!isGameAudioActiveOrRecent()) {\n                cancelGameExitRecovery();\n                musicWasPlayingBeforeGame = musicPlayingNow;\n            }\n        }\n\n        if (!pausedByExternalMedia || pendingResume != null) return;\n'''
if old_else in monitor:
    monitor = monitor.replace(old_else, new_else, 1)

helper_marker = '    private static void scheduleHeadphonePause() {\n'
helper = '''    private static void scheduleGameExitRecovery() {\n        cancelGameExitRecovery();\n        gameExitRecoveryAttempt = 0;\n        gameExitRecovery = new Runnable() {\n            @Override public void run() {\n                MusicService service = MusicService.getInstance();\n                if (service == null || externalMediaActive || !musicWasPlayingBeforeGame ||\n                        !service.shouldResumeAfterGameInterruption()) {\n                    cancelGameExitRecovery();\n                    return;\n                }\n                if (!isServicePlaying(service)) {\n                    Context context = appContext;\n                    if (context != null) {\n                        try {\n                            Intent resume = new Intent(context, MusicService.class)\n                                    .setAction(MusicService.ACTION_RESUME);\n                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(resume);\n                            else context.startService(resume);\n                        } catch (Exception ignored) {}\n                    }\n                }\n                gameExitRecoveryAttempt++;\n                if (gameExitRecoveryAttempt >= 12 || (!gameAudioActive && !isGameAudioActiveOrRecent())) {\n                    cancelGameExitRecovery();\n                    musicWasPlayingBeforeGame = isServicePlaying(service);\n                    return;\n                }\n                handler.postDelayed(this, gameExitRecoveryAttempt < 3 ? 250L : 700L);\n            }\n        };\n        handler.postDelayed(gameExitRecovery, 120L);\n    }\n\n'''
if 'private static void scheduleGameExitRecovery()' not in monitor:
    if helper_marker not in monitor:
        raise SystemExit('recovery helper marker not found')
    monitor = monitor.replace(helper_marker, helper + helper_marker, 1)

cancel_marker = '    private static void cancelPendingHeadphonePause() {\n'
cancel_helper = '''    private static void cancelGameExitRecovery() {\n        if (gameExitRecovery != null) handler.removeCallbacks(gameExitRecovery);\n        gameExitRecovery = null;\n        gameExitRecoveryAttempt = 0;\n    }\n\n'''
if 'private static void cancelGameExitRecovery()' not in monitor:
    if cancel_marker not in monitor:
        raise SystemExit('recovery cancel marker not found')
    monitor = monitor.replace(cancel_marker, cancel_helper + cancel_marker, 1)

# Add a second guard directly inside MusicService. This protects playback even
# when a game steals focus transiently several times during loading or a crash.
service_field = '    private Runnable sleepRunnable;\n'
service_field_new = '''    private Runnable sleepRunnable;\n    private Runnable gameFocusRecovery;\n    private int gameFocusRecoveryAttempt = 0;\n'''
if 'private Runnable gameFocusRecovery;' not in service:
    if service_field not in service:
        raise SystemExit('MusicService runnable marker not found')
    service = service.replace(service_field, service_field_new, 1)

focus_listener_marker = '    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {\n'
recovery_method = '''    private void scheduleGameFocusRecovery() {\n        if (gameFocusRecovery != null) handler.removeCallbacks(gameFocusRecovery);\n        gameFocusRecoveryAttempt = 0;\n        gameFocusRecovery = new Runnable() {\n            @Override public void run() {\n                if (!sessionWantsPlayback || pausedByExternalMedia || explicitStopRequested ||\n                        ExternalMediaMonitor.isExternalMediaActive() ||\n                        !ExternalMediaMonitor.isGameAudioActiveOrRecent()) {\n                    if (gameFocusRecovery != null) handler.removeCallbacks(gameFocusRecovery);\n                    gameFocusRecovery = null;\n                    return;\n                }\n                try {\n                    if (player != null && prepared && !player.isPlaying()) {\n                        requestFocus();\n                        player.start();\n                        pausedByFocus = false;\n                        ducked = false;\n                        applyVolume();\n                        updateNotification();\n                        persistSession();\n                        MainActivity.dispatchToWeb(\"window.onNativePlaybackStarted && window.onNativePlaybackStarted();\");\n                    }\n                } catch (Exception ignored) {}\n                gameFocusRecoveryAttempt++;\n                if (gameFocusRecoveryAttempt >= 20) {\n                    gameFocusRecovery = null;\n                    return;\n                }\n                handler.postDelayed(this, gameFocusRecoveryAttempt < 5 ? 180L : 650L);\n            }\n        };\n        handler.postDelayed(gameFocusRecovery, 80L);\n    }\n\n'''
if 'private void scheduleGameFocusRecovery()' not in service:
    if focus_listener_marker not in service:
        raise SystemExit('focus listener marker not found')
    service = service.replace(focus_listener_marker, recovery_method + focus_listener_marker, 1)

transient_old = '''        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {\n            pause(true);\n            return;\n        }\n'''
transient_new = '''        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {\n            if (!pausedByExternalMedia && sessionWantsPlayback &&\n                    ExternalMediaMonitor.isGameAudioActiveOrRecent()) {\n                pausedByFocus = false;\n                scheduleGameFocusRecovery();\n                return;\n            }\n            pause(true);\n            return;\n        }\n'''
if transient_old in service:
    service = service.replace(transient_old, transient_new, 1)

loss_old = '''        if (change == AudioManager.AUDIOFOCUS_LOSS) {\n            pausedByFocus = false;\n'''
loss_new = '''        if (change == AudioManager.AUDIOFOCUS_LOSS) {\n            if (!pausedByExternalMedia && sessionWantsPlayback &&\n                    ExternalMediaMonitor.isGameAudioActiveOrRecent()) {\n                pausedByFocus = true;\n                scheduleGameFocusRecovery();\n                return;\n            }\n            pausedByFocus = false;\n'''
if loss_old in service:
    service = service.replace(loss_old, loss_new, 1)
elif 'scheduleGameFocusRecovery();' not in service.split('AUDIOFOCUS_LOSS)', 1)[-1]:
    raise SystemExit('focus loss block not found')

service_path.write_text(service, encoding='utf-8')
monitor_path.write_text(monitor, encoding='utf-8')
print('Game survival audio recovery applied')
