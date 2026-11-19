package app.heliummail.client;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeMailPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
