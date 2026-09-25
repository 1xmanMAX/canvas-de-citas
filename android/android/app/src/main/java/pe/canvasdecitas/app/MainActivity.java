package pe.canvasdecitas.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios de la app (antes de crear el puente).
        registerPlugin(Vinculo.class);
        registerPlugin(Voz.class);
        registerPlugin(Archivos.class);
        super.onCreate(savedInstanceState);
        // Se abrió desde "Compartir → Canvas de Citas" (y no al volver de una rotación).
        if (savedInstanceState == null) Archivos.recibir(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Archivos.recibir(intent);
    }
}
