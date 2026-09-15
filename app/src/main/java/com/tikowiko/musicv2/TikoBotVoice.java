package com.tikowiko.musicv2;

import android.content.Context;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import java.util.Locale;

/** Voix locale de TikoBot : française, un peu plus grave et légèrement robotique. */
public final class TikoBotVoice implements TextToSpeech.OnInitListener {
    private static final String UTTERANCE_ID = "tikobot";
    private final TextToSpeech tts;
    private boolean ready = false;

    public TikoBotVoice(Context context) {
        tts = new TextToSpeech(context.getApplicationContext(), this);
    }

    @Override public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) return;

        int result = tts.setLanguage(Locale.FRANCE);
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts.setLanguage(Locale.FRENCH);
        }

        // Une voix plus grave donne un rendu plus masculin sans devenir caricatural.
        tts.setPitch(0.78f);
        tts.setSpeechRate(0.93f);

        // Préférer une voix française locale quand le moteur TTS du téléphone en fournit une.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                Voice selected = null;
                for (Voice voice : tts.getVoices()) {
                    if (voice == null || voice.getLocale() == null) continue;
                    if (!"fr".equalsIgnoreCase(voice.getLocale().getLanguage())) continue;
                    if (voice.isNetworkConnectionRequired()) continue;
                    selected = voice;
                    break;
                }
                if (selected != null) tts.setVoice(selected);
            } catch (Exception ignored) {}
        }

        // Le WebView est informé du vrai début et de la vraie fin de la voix.
        // Cela permet au visage de TikoBot de parler pendant exactement la durée du TTS.
        try {
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {
                    if (!UTTERANCE_ID.equals(utteranceId)) return;
                    MainActivity.dispatchToWeb(
                            "window.onTikoBotVoiceStart && window.onTikoBotVoiceStart();"
                    );
                }

                @Override public void onDone(String utteranceId) {
                    if (!UTTERANCE_ID.equals(utteranceId)) return;
                    MainActivity.dispatchToWeb(
                            "window.onTikoBotVoiceEnd && window.onTikoBotVoiceEnd();"
                    );
                }

                @Override public void onError(String utteranceId) {
                    if (!UTTERANCE_ID.equals(utteranceId)) return;
                    MainActivity.dispatchToWeb(
                            "window.onTikoBotVoiceEnd && window.onTikoBotVoiceEnd();"
                    );
                }
            });
        } catch (Exception ignored) {}

        ready = true;
    }

    public void speak(String text) {
        if (!ready || text == null) return;
        String value = text.trim();
        if (value.isEmpty()) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                tts.speak(value, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID);
            } else {
                //noinspection deprecation
                tts.speak(value, TextToSpeech.QUEUE_FLUSH, null);
            }
        } catch (Exception ignored) {}
    }

    public void stop() {
        try { tts.stop(); } catch (Exception ignored) {}
        MainActivity.dispatchToWeb(
                "window.onTikoBotVoiceEnd && window.onTikoBotVoiceEnd();"
        );
    }

    public void shutdown() {
        try { tts.stop(); } catch (Exception ignored) {}
        try { tts.shutdown(); } catch (Exception ignored) {}
        ready = false;
    }
}
