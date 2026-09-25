package pe.canvasdecitas.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios de la app (antes de crear el puente).
        registerPlugin(Vinculo.class);
        registerPlugin(Voz.class);
        super.onCreate(savedInstanceState);
    }
}
