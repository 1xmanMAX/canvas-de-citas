package pe.canvasdecitas.app;

import android.content.Intent;
import android.media.AudioFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.speech.RecognitionListener;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Transcribe una nota de voz ya grabada con el reconocedor de voz de Android, en el propio
 * celular (sin internet). El WebView no trae el reconocimiento de voz de Chrome.
 * Desde la web: Capacitor.nativePromise('Voz', 'transcribir', { pcm, frecuencia, idioma })
 * → { texto, idioma }. `pcm`: base64 de PCM de 16 bits, mono, little-endian.
 * Necesita Android 13+ (reconocer desde un archivo de audio en vez del micrófono).
 */
@CapacitorPlugin(name = "Voz")
public class Voz extends Plugin {

    private final Handler principal = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void transcribir(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.reject("Transcribir en el celular necesita Android 13 o más reciente.");
            return;
        }
        String pcmB64 = call.getString("pcm");
        if (pcmB64 == null || pcmB64.isEmpty()) {
            call.reject("No llegó el audio.");
            return;
        }
        byte[] pcm = Base64.decode(pcmB64, Base64.DEFAULT);
        int frecuencia = call.getInt("frecuencia", 16000);
        String idioma = call.getString("idioma", "es-PE");
        // SpeechRecognizer se crea y se usa en el hilo principal.
        principal.post(() -> elegirIdioma(call, pcm, frecuencia, idioma));
    }

    private Intent intencion(String idioma) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, idioma);
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        return i;
    }

    /** Busca un español instalado en el celular; si no hay, pide descargarlo. */
    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private void elegirIdioma(PluginCall call, byte[] pcm, int frecuencia, String pedido) {
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
            call.reject("Este celular no tiene reconocimiento de voz sin conexión (instala o actualiza la app de Google).");
            return;
        }
        SpeechRecognizer consulta = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
        consulta.checkRecognitionSupport(
            intencion(pedido),
            principal::post,
            new RecognitionSupportCallback() {
                @Override
                public void onSupportResult(RecognitionSupport soporte) {
                    consulta.destroy();
                    String instalado = mejor(pedido, soporte.getInstalledOnDeviceLanguages());
                    if (instalado != null) {
                        reconocer(call, pcm, frecuencia, instalado);
                        return;
                    }
                    String pendiente = mejor(pedido, soporte.getPendingOnDeviceLanguages());
                    String disponible = pendiente != null ? pendiente : mejor(pedido, soporte.getSupportedOnDeviceLanguages());
                    if (disponible == null) {
                        call.reject("El reconocedor de voz del celular no tiene español.");
                        return;
                    }
                    SpeechRecognizer descarga = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                    descarga.triggerModelDownload(intencion(disponible));
                    principal.postDelayed(descarga::destroy, 5000);
                    call.reject("Descargando el paquete de voz en español; vuelve a tocar \"Transcribir\" en unos minutos.");
                }

                @Override
                public void onError(int error) {
                    consulta.destroy();
                    // Algunos celulares no responden la consulta: se intenta igual.
                    reconocer(call, pcm, frecuencia, pedido);
                }
            }
        );
    }

    /** El idioma pedido si está; si no, otro español (es-419, es-US, es-ES…). */
    static String mejor(String pedido, List<String> idiomas) {
        if (idiomas == null || idiomas.isEmpty()) return null;
        for (String i : idiomas) if (i.equalsIgnoreCase(pedido)) return i;
        for (String preferido : new String[] { "es-419", "es-US", "es-MX", "es-ES" })
            for (String i : idiomas) if (i.equalsIgnoreCase(preferido)) return i;
        for (String i : idiomas) if (i.toLowerCase(Locale.ROOT).startsWith("es")) return i;
        return null;
    }

    @RequiresApi(Build.VERSION_CODES.TIRAMISU)
    private void reconocer(PluginCall call, byte[] pcm, int frecuencia, String idioma) {
        ParcelFileDescriptor[] tubo;
        try {
            tubo = ParcelFileDescriptor.createPipe();
        } catch (IOException e) {
            call.reject("No se pudo preparar el audio: " + e.getMessage());
            return;
        }
        SpeechRecognizer rec = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
        StringBuilder texto = new StringBuilder();
        boolean[] terminado = { false };
        // Por si el reconocedor no avisa del final: el doble de la duración más 30 s.
        long tope = (long) pcm.length * 1000 / (2L * frecuencia) * 2 + 30000;

        Runnable fin = new Runnable() {
            @Override
            public void run() {
                if (terminado[0]) return;
                terminado[0] = true;
                principal.removeCallbacks(this);
                rec.destroy();
                try {
                    tubo[0].close();
                } catch (IOException ignorado) {}
                JSObject r = new JSObject();
                r.put("texto", texto.toString().trim());
                r.put("idioma", idioma);
                call.resolve(r);
            }
        };

        rec.setRecognitionListener(
            new RecognitionListener() {
                private void agregar(Bundle resultados) {
                    ArrayList<String> l = resultados == null ? null : resultados.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (l != null && !l.isEmpty() && l.get(0) != null) texto.append(' ').append(l.get(0));
                }

                @Override
                public void onSegmentResults(Bundle resultados) {
                    agregar(resultados);
                }

                @Override
                public void onEndOfSegmentedSession() {
                    fin.run();
                }

                @Override
                public void onResults(Bundle resultados) {
                    agregar(resultados);
                    fin.run();
                }

                @Override
                public void onError(int error) {
                    if (terminado[0]) return;
                    boolean nada = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
                    if (texto.length() > 0 || nada) {
                        fin.run();
                        return;
                    }
                    terminado[0] = true;
                    principal.removeCallbacks(fin);
                    rec.destroy();
                    try {
                        tubo[0].close();
                    } catch (IOException ignorado) {}
                    call.reject("El reconocedor de voz falló (código " + error + ").");
                }

                @Override
                public void onReadyForSpeech(Bundle params) {}

                @Override
                public void onBeginningOfSpeech() {}

                @Override
                public void onRmsChanged(float rmsdB) {}

                @Override
                public void onBufferReceived(byte[] buffer) {}

                @Override
                public void onEndOfSpeech() {}

                @Override
                public void onPartialResults(Bundle parciales) {}

                @Override
                public void onEvent(int tipo, Bundle params) {}
            }
        );

        Intent i = intencion(idioma);
        i.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, tubo[0]);
        i.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1);
        i.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
        i.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, frecuencia);
        // Sesión por segmentos: transcribe todo el audio (no se corta en el primer silencio).
        i.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE);
        rec.startListening(i);
        principal.postDelayed(fin, tope);

        // Se escribe el audio en otro hilo: el tubo se llena y espera a que el reconocedor lea.
        new Thread(() -> {
            try (OutputStream salida = new ParcelFileDescriptor.AutoCloseOutputStream(tubo[1])) {
                salida.write(pcm);
            } catch (IOException ignorado) {
                // El reconocedor cerró el tubo (terminó o falló): nada más que escribir.
            }
        }, "voz-audio").start();
    }
}
