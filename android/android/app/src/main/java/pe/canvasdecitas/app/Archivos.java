package pe.canvasdecitas.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Archivos entre la app y el resto del celular (lo que en la PC hacen las descargas y el receptor):
 * - compartir({ nombre, tipo, datos }) abre la hoja "Compartir" de Android para guardar o enviar
 *   un archivo (JSON, .bib, PDF…): el WebView no puede descargar.
 * - recibidos() devuelve lo que otra app compartió con Canvas de Citas ("Compartir → Canvas de
 *   Citas"): [{ nombre, tipo, datos }] o [{ texto }]. `datos` va en base64.
 */
@CapacitorPlugin(name = "Archivos")
public class Archivos extends Plugin {

    private static final long TOPE = 80L * 1024 * 1024;
    private static final List<Object> pendientes = new ArrayList<>(); // Uri o String (texto)
    private static final List<String> tipos = new ArrayList<>();

    /** Lo llama MainActivity con cada Intent (al abrir la app o si ya estaba abierta). */
    static synchronized void recibir(Intent intent) {
        if (intent == null) return;
        String accion = intent.getAction();
        String tipo = intent.getType();
        if (Intent.ACTION_SEND.equals(accion)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                pendientes.add(uri);
                tipos.add(tipo);
            } else {
                CharSequence texto = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                CharSequence asunto = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
                if (texto != null && texto.length() > 0) {
                    pendientes.add((asunto != null && asunto.length() > 0 && !texto.toString().contains(asunto) ? asunto + "\n" : "") + texto);
                    tipos.add("text/plain");
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(accion)) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null) for (Uri u : uris) {
                pendientes.add(u);
                tipos.add(tipo);
            }
        }
    }

    @PluginMethod
    public void recibidos(PluginCall call) {
        List<Object> lista;
        List<String> ts;
        synchronized (Archivos.class) {
            lista = new ArrayList<>(pendientes);
            ts = new ArrayList<>(tipos);
            pendientes.clear();
            tipos.clear();
        }
        // Leer los archivos puede tardar: fuera del hilo principal.
        new Thread(() -> {
            JSArray out = new JSArray();
            for (int i = 0; i < lista.size(); i++) {
                Object x = lista.get(i);
                JSObject o = new JSObject();
                if (x instanceof String) {
                    o.put("texto", x);
                } else {
                    Uri uri = (Uri) x;
                    try {
                        byte[] b = leer(uri);
                        String tipo = getContext().getContentResolver().getType(uri);
                        o.put("nombre", nombreDe(uri));
                        o.put("tipo", tipo != null ? tipo : ts.get(i));
                        o.put("datos", Base64.encodeToString(b, Base64.NO_WRAP));
                    } catch (Exception e) {
                        o.put("error", "No se pudo leer " + nombreDe(uri) + ": " + e.getMessage());
                    }
                }
                out.put(o);
            }
            JSObject r = new JSObject();
            r.put("archivos", out);
            call.resolve(r);
        }, "archivos-recibidos").start();
    }

    private byte[] leer(Uri uri) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) throw new Exception("sin datos");
            byte[] buf = new byte[64 * 1024];
            long total = 0;
            for (int n; (n = in.read(buf)) > 0; ) {
                total += n;
                if (total > TOPE) throw new Exception("es demasiado grande");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    private String nombreDe(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignorado) {}
        String s = uri.getLastPathSegment();
        return s != null ? s : "archivo";
    }

    /** compartir({ archivos: [{ nombre, tipo, datos }] }) — o un solo archivo: { nombre, tipo, datos }. */
    @PluginMethod
    public void compartir(PluginCall call) {
        try {
            List<JSObject> lista = new ArrayList<>();
            JSArray varios = call.getArray("archivos");
            if (varios != null) for (int i = 0; i < varios.length(); i++) lista.add(JSObject.fromJSONObject(varios.getJSONObject(i)));
            else lista.add(call.getData());
            if (lista.isEmpty() || lista.get(0).getString("datos") == null) {
                call.reject("No llegó el archivo.");
                return;
            }
            File dir = new File(getContext().getCacheDir(), "compartidos");
            dir.mkdirs();
            File[] viejos = dir.listFiles();
            if (viejos != null) for (File f : viejos) f.delete();
            ArrayList<Uri> uris = new ArrayList<>();
            String tipo = null;
            for (JSObject a : lista) {
                String nombre = a.getString("nombre", "archivo");
                File archivo = new File(dir, nombre.replaceAll("[\\\\/:*?\"<>|]", "_"));
                try (FileOutputStream out = new FileOutputStream(archivo)) {
                    out.write(Base64.decode(a.getString("datos"), Base64.DEFAULT));
                }
                uris.add(FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", archivo));
                String t = a.getString("tipo", "application/octet-stream");
                tipo = tipo == null || tipo.equals(t) ? t : "*/*";
            }
            Intent envio;
            if (uris.size() == 1) {
                envio = new Intent(Intent.ACTION_SEND);
                envio.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            } else {
                envio = new Intent(Intent.ACTION_SEND_MULTIPLE);
                envio.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            }
            envio.setType(tipo);
            envio.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            String titulo = lista.size() == 1 ? lista.get(0).getString("nombre", "archivo") : lista.size() + " archivos";
            Intent elegir = Intent.createChooser(envio, "Guardar o compartir " + titulo);
            elegir.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(elegir);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo compartir: " + e.getMessage());
        }
    }
}
