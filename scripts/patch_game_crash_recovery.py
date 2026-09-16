from pathlib import Path

service_path = Path('app/src/main/java/com/tikowiko/musicv2/MusicService.java')
monitor_path = Path('app/src/main/java/com/tikowiko/musicv2/ExternalMediaMonitor.java')

service = service_path.read_text(encoding='utf-8')
monitor = monitor_path.read_text(encoding='utf-8')

# Expose whether playback was only interrupted by another app. A real manual
# pause sets sessionWantsPlayback=false, so recovery must never restart music
# the user intentionally stopped.
service_marker = '''    public String getStateJson() {\n'''
service_method = '''    public boolean shouldResumeAfterGameInterruption() {\n        return currentTrack() != null && sessionWantsPlayback &&\n                !pausedByExternalMedia && !explicitStopRequested;\n    }\n\n'''
if service_method not in service:
    if service_marker not in service:
        raise SystemExit('MusicService marker not found')
    service = service.replace(service_marker, service_method + service_marker, 1)

# Keep track of a short recovery window after game audio disappears. This is
# especially important when the game crashes: Android does not always emit a
# clean AUDIOFOCUS_GAIN afterwards.
field_marker = '''    private static Runnable pendingHeadphonePause;\n'''
field_new = '''    private static Runnable pendingHeadphonePause;\n    private static Runnable gameExitRecovery;\n    private static int gameExitRecoveryAttempt = 0;\n'''
if 'private static Runnable gameExitRecovery;' not in monitor:
    if field_marker not in monitor:
        raise SystemExit('ExternalMediaMonitor field marker not found')
    monitor = monitor.replace(field_marker, field_new, 1)

stop_marker = '''        cancelPendingHeadphonePause();\n'''
if 'cancelGameExitRecovery();' not in monitor.split('public static void stop()', 1)[1].split('if (audioManager', 1)[0]:
    monitor = monitor.replace(stop_marker, stop_marker + '        cancelGameExitRecovery();\n', 1)

old_else = '''        } else {\n            cancelGameGuard();\n            musicWasPlayingBeforeGame = musicPlayingNow;\n        }\n\n        if (!pausedByExternalMedia || pendingResume != null) return;\n'''
new_else = '''        } else {\n            cancelGameGuard();\n            if (hadGameAudio && musicWasPlayingBeforeGame && !musicPlayingNow &&\n                    service.shouldResumeAfterGameInterruption()) {\n                scheduleGameExitRecovery();\n            } else {\n                cancelGameExitRecovery();\n                musicWasPlayingBeforeGame = musicPlayingNow;\n            }\n        }\n\n        if (!pausedByExternalMedia || pendingResume != null) return;\n'''
if old_else in monitor:
    monitor = monitor.replace(old_else, new_else, 1)
elif 'scheduleGameExitRecovery();' not in monitor:
    raise SystemExit('ExternalMediaMonitor game-exit branch not found')

helper_marker = '''    private static void scheduleHeadphonePause() {\n'''
helper = '''    private static void scheduleGameExitRecovery() {\n        cancelGameExitRecovery();\n        gameExitRecoveryAttempt = 0;\n        gameExitRecovery = new Runnable() {\n            @Override public void run() {\n                MusicService service = MusicService.getInstance();\n                if (service == null || externalMediaActive || gameAudioActive ||\n                        !musicWasPlayingBeforeGame || !service.shouldResumeAfterGameInterruption()) {\n                    cancelGameExitRecovery();\n                    musicWasPlayingBeforeGame = isServicePlaying(service);\n                    return;\n                }\n\n                if (isServicePlaying(service)) {\n                    cancelGameExitRecovery();\n                    musicWasPlayingBeforeGame = true;\n                    return;\n                }\n\n                Context context = appContext;\n                if (context != null) {\n                    try {\n                        Intent resume = new Intent(context, MusicService.class)\n                                .setAction(MusicService.ACTION_RESUME);\n                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(resume);\n                        else context.startService(resume);\n                    } catch (Exception ignored) {}\n                }\n\n                gameExitRecoveryAttempt++;\n                if (gameExitRecoveryAttempt >= 5) {\n                    cancelGameExitRecovery();\n                    return;\n                }\n                long delay = gameExitRecoveryAttempt == 1 ? 250L :\n                        (gameExitRecoveryAttempt == 2 ? 500L : 900L);\n                handler.postDelayed(this, delay);\n            }\n        };\n        handler.postDelayed(gameExitRecovery, 180L);\n    }\n\n'''
if 'private static void scheduleGameExitRecovery()' not in monitor:
    if helper_marker not in monitor:
        raise SystemExit('ExternalMediaMonitor helper marker not found')
    monitor = monitor.replace(helper_marker, helper + helper_marker, 1)

cancel_marker = '''    private static void cancelPendingHeadphonePause() {\n'''
cancel_helper = '''    private static void cancelGameExitRecovery() {\n        if (gameExitRecovery != null) handler.removeCallbacks(gameExitRecovery);\n        gameExitRecovery = null;\n        gameExitRecoveryAttempt = 0;\n    }\n\n'''
if 'private static void cancelGameExitRecovery()' not in monitor:
    if cancel_marker not in monitor:
        raise SystemExit('ExternalMediaMonitor cancel marker not found')
    monitor = monitor.replace(cancel_marker, cancel_helper + cancel_marker, 1)

# If the game caused a permanent focus loss just before crashing, remember that
# this is still a recoverable interruption. The game-exit guard above remains
# responsible for the actual restart and still respects manual pause.
focus_old = '''        if (change == AudioManager.AUDIOFOCUS_LOSS) {\n            pausedByFocus = false;\n'''
focus_new = '''        if (change == AudioManager.AUDIOFOCUS_LOSS) {\n            pausedByFocus = ExternalMediaMonitor.isGameAudioActive() &&\n                    sessionWantsPlayback && !pausedByExternalMedia;\n'''
if focus_old in service:
    service = service.replace(focus_old, focus_new, 1)
elif 'pausedByFocus = ExternalMediaMonitor.isGameAudioActive()' not in service:
    raise SystemExit('MusicService focus-loss block not found')

service_path.write_text(service, encoding='utf-8')
monitor_path.write_text(monitor, encoding='utf-8')
print('Game crash audio recovery applied')
